// Key pool: offline-generated keys (keygen/), one seed per test. The worker
// sees viewing keys and addresses only.
import { readFileSync } from "node:fs";
import { and, asc, eq } from "drizzle-orm";
import zcash from "@ledgerhq/zcash-utils";
import { keyBatches, keyPool, type Db, type PoolKey } from "@zecproof/db";
import { compareWalletAddresses, parseBatchPublic, type NetworkId } from "@zecproof/zcash";
import type { HealthyEndpoint } from "./endpoints";
import { hasTaddressHistory } from "./lightwalletd";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Any on-chain activity for this key since its batch birthday? A fresh key has
 * none; activity means the key was handed out before (e.g. the database was
 * reset and the batch re-imported), so it must not be reused.
 */
async function keyHasHistory(endpoint: HealthyEndpoint, key: PoolKey, network: NetworkId): Promise<string | undefined> {
  if (await hasTaddressHistory(endpoint.client, key.transparentAddress, key.birthdayHeight, endpoint.tip)) {
    return "transparent receiver has on-chain history";
  }
  const stream = await zcash.startSync({
    grpcUrl: endpoint.url,
    viewingKey: key.ufvk,
    startHeight: key.birthdayHeight,
    endHeight: endpoint.tip,
    network,
    orchardOnly: false,
  });
  const first = await stream.next();
  if (first) {
    stream.cancel();
    return `shielded activity in tx ${first.txid} at height ${first.blockHeight}`;
  }
  await stream.stats();
  return undefined;
}

/** Takes the next unused pool key, burning any that turn out to have history. */
export async function takePoolKey(tx: Tx, endpoint: HealthyEndpoint, network: NetworkId): Promise<PoolKey | undefined> {
  for (;;) {
    const [key] = await tx
      .select()
      .from(keyPool)
      .where(and(eq(keyPool.network, network), eq(keyPool.status, "available")))
      .orderBy(asc(keyPool.createdAt), asc(keyPool.batchIndex))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!key) return undefined;
    const history = await keyHasHistory(endpoint, key, network);
    if (history) {
      await tx.update(keyPool).set({ status: "burned", burnedReason: history }).where(eq(keyPool.id, key.id));
      console.warn(`burned    pool key ${key.id}: ${history}`);
      continue;
    }
    await tx.update(keyPool).set({ status: "assigned", assignedAt: new Date() }).where(eq(keyPool.id, key.id));
    return key;
  }
}

/** Imports a verified batch's public file. Seeds are never part of it. */
export async function importBatch(db: Db, path: string, allowMainnet: boolean) {
  const batch = parseBatchPublic(JSON.parse(readFileSync(path, "utf8")));
  if (batch.network === "mainnet" && !allowMainnet) {
    throw new Error("This is a mainnet batch. Set ZECPROOF_ALLOW_MAINNET=yes to import it.");
  }
  const v = batch.verification;
  if (!v) throw new Error("Batch is not verified. Run `keygen verify` with an address from a wallet that restored one seed.");
  // Re-check the recorded comparison rather than trusting the file's summary.
  const recheck = compareWalletAddresses(batch, v.index, v.addresses);

  const [existing] = await db.select().from(keyBatches).where(eq(keyBatches.batchId, batch.batchId));
  if (existing) throw new Error(`Batch ${batch.batchId} was already imported on ${existing.importedAt.toISOString()}.`);

  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(keyBatches)
      .values({
        batchId: batch.batchId,
        network: batch.network,
        keyCount: batch.keys.length,
        birthdayHeight: batch.birthdayHeight,
        derivation: batch.derivation,
        verifiedIndex: v.index,
        verifiedAddresses: v.addresses,
        verifiedReceivers: recheck.matched,
        verifiedAt: new Date(v.verifiedAt),
      })
      .returning({ id: keyBatches.id });
    await tx.insert(keyPool).values(
      batch.keys.map((k) => ({
        batchId: row.id,
        batchIndex: k.index,
        network: batch.network,
        ufvk: k.ufvk,
        ironwoodUa: k.ironwoodUa,
        fullUa: k.fullUa,
        transparentAddress: k.transparentAddress,
        birthdayHeight: batch.birthdayHeight,
      })),
    );
  });
  return batch;
}
