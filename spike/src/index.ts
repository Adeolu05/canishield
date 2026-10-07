// CanIShield day-1 spike: which pool did an incoming testnet payment land in?
//
//   npm run spike            one pass: scan birthday → tip, print what landed
//   npm run spike -- --watch keep polling every 30s until Ctrl+C
//
// Testnet only. Imports no send/sign function from @ledgerhq/zcash-utils.
import { setTimeout as sleep } from "node:timers/promises";
import zcash, { type ShieldedNote } from "@ledgerhq/zcash-utils";
import { GRPC_URL, NETWORK, POLL_INTERVAL_MS, formatTaz } from "./config.js";
import { connect, getAddressUtxos, getLightdInfo } from "./lightwalletd.js";
import { loadOrCreateWallet, transparentAddressFromXpub } from "./wallet.js";

const { getChainTip, startSync, orchardAddressFromUfvk } = zcash;

type Pool = "ironwood" | "orchard" | "sapling" | "transparent";

interface Receipt {
  pool: Pool;
  txid: string;
  height: number;
  amountZat: number;
  memo?: string;
}

const POOL_LABEL: Record<Pool, string> = {
  ironwood: "IRONWOOD   ",
  orchard: "ORCHARD (!)", // sealed at NU6.3, so a new deposit here would be anomalous
  sapling: "SAPLING    ",
  transparent: "TRANSPARENT",
};

const watch = process.argv.includes("--watch");
const seen = new Set<string>();

function report(r: Receipt) {
  const key = `${r.pool}:${r.txid}:${r.amountZat}`;
  if (seen.has(key)) return;
  seen.add(key);
  const memo = r.memo ? `  memo="${r.memo}"` : "";
  console.log(
    `  → landed in ${POOL_LABEL[r.pool]}  +${formatTaz(r.amountZat)}  height ${r.height}  txid ${r.txid}${memo}`,
  );
}

const incoming = (notes: ShieldedNote[]) => notes.filter((n) => n.transferType === "incoming");

async function scanShielded(ufvk: string, from: number, to: number) {
  const stream = await startSync({
    grpcUrl: GRPC_URL,
    viewingKey: ufvk,
    startHeight: from,
    endHeight: to,
    network: NETWORK,
    orchardOnly: false, // we want Sapling too
  });
  let tx;
  while ((tx = await stream.next()) !== null) {
    const pools: [Pool, ShieldedNote[]][] = [
      ["ironwood", tx.ironwoodNotes],
      ["orchard", tx.orchardNotes],
      ["sapling", tx.saplingNotes],
    ];
    for (const [pool, notes] of pools) {
      for (const n of incoming(notes)) {
        report({ pool, txid: tx.txid, height: tx.blockHeight, amountZat: n.amount, memo: n.memo });
      }
    }
  }
  return stream.stats();
}

async function main() {
  const client = connect(GRPC_URL);

  // Guard: the server itself must say it is on testnet.
  const info = await getLightdInfo(client);
  if (info.chainName !== "test") {
    throw new Error(`Endpoint ${GRPC_URL} reports chain "${info.chainName}", not "test". Aborting.`);
  }
  const tip = await getChainTip(GRPC_URL);
  console.log(`Endpoint  ${GRPC_URL}  (${info.vendor} ${info.version}, chain=${info.chainName}, tip=${tip})`);

  const { wallet, created } = loadOrCreateWallet(tip);
  console.log(created ? "Wallet    created new throwaway testnet wallet in spike/.wallet/" : "Wallet    loaded");
  console.log(`Birthday  ${wallet.birthdayHeight}`);
  console.log(`UFVK      ${wallet.ufvk.slice(0, 24)}…`);

  const shieldedAddr = orchardAddressFromUfvk(wallet.ufvk);
  const tAddr = wallet.xpub ? transparentAddressFromXpub(wallet.xpub) : undefined;
  console.log("\nSend testnet TAZ to either address:");
  console.log(`  Shielded UA (Orchard receiver → lands in Ironwood post-NU6.3):\n    ${shieldedAddr}`);
  console.log(tAddr ? `  Transparent:\n    ${tAddr}` : "  Transparent: n/a (view-only UFVK mode)");
  console.log("  Sapling: no address. This package cannot derive Sapling receivers (scan still detects them).\n");

  let from = wallet.birthdayHeight;
  for (;;) {
    const to = await getChainTip(GRPC_URL);
    if (to >= from) {
      console.log(`Scanning blocks ${from}–${to}…`);
      const stats = await scanShielded(wallet.ufvk, from, to);
      if (tAddr) {
        for (const u of await getAddressUtxos(client, tAddr, from)) {
          report({ pool: "transparent", txid: u.txid, height: u.height, amountZat: u.valueZat });
        }
      }
      console.log(`  scanned ${stats.blocksScanned} blocks in ${stats.elapsedMs} ms; ${seen.size} receipt(s) so far`);
      from = to + 1;
    }
    if (!watch) break;
    await sleep(POLL_INTERVAL_MS);
  }
  if (seen.size === 0) {
    console.log("\nNo incoming payment yet. Mined blocks only; the mempool is not checked.");
  }
  client.close();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
