// Find the first payment to a test's address and say which pool it landed in.
// Ported from spike/src/index.ts.
import zcash, { type ShieldedNote } from "@ledgerhq/zcash-utils";
import type { Pool, Test } from "@zecproof/db";
import { GRPC_URL, NETWORK, assertTestnetUfvk } from "./config";
import { getAddressUtxos, type connect } from "./lightwalletd";

export interface Receipt {
  pool: Pool;
  txid: string;
  height: number;
  amountZat: number;
  memo?: string;
}

const incoming = (notes: ShieldedNote[]) => notes.filter((n) => n.transferType === "incoming");

async function scanShielded(ufvk: string, from: number, to: number): Promise<Receipt[]> {
  const stream = await zcash.startSync({
    grpcUrl: GRPC_URL,
    viewingKey: ufvk,
    startHeight: from,
    endHeight: to,
    network: NETWORK,
    orchardOnly: false, // keep Sapling detection on, even though Sapling tests are deferred
  });
  const found: Receipt[] = [];
  let tx;
  while ((tx = await stream.next()) !== null) {
    const pools: [Pool, ShieldedNote[]][] = [
      ["ironwood", tx.ironwoodNotes],
      ["orchard", tx.orchardNotes],
      ["sapling", tx.saplingNotes],
    ];
    for (const [pool, notes] of pools) {
      for (const n of incoming(notes)) {
        found.push({ pool, txid: tx.txid, height: tx.blockHeight, amountZat: n.amount, memo: n.memo || undefined });
      }
    }
  }
  await stream.stats();
  return found;
}

/**
 * Scans blocks (scannedToHeight, tip] for the test's shielded receivers, and
 * the transparent receiver's UTXOs since the birthday. Returns the earliest
 * receipt, if any. Mined blocks only.
 */
export async function findFirstReceipt(
  client: ReturnType<typeof connect>,
  test: Test,
  tip: number,
): Promise<Receipt | undefined> {
  if (!test.ufvk || test.birthdayHeight == null) throw new Error(`Test ${test.id} has no keys assigned`);
  assertTestnetUfvk(test.ufvk);

  const from = (test.scannedToHeight ?? test.birthdayHeight - 1) + 1;
  const receipts: Receipt[] = [];

  // A bare t-address cannot receive shielded funds, so skip trial decryption.
  if (test.addressType !== "transparent" && from <= tip) {
    receipts.push(...(await scanShielded(test.ufvk, from, tip)));
  }
  if (test.transparentAddress) {
    for (const u of await getAddressUtxos(client, test.transparentAddress, test.birthdayHeight)) {
      receipts.push({ pool: "transparent", txid: u.txid, height: u.height, amountZat: u.valueZat });
    }
  }
  return receipts.sort((a, b) => a.height - b.height)[0];
}
