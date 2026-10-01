// ZecProof scanner worker (testnet only).
//
// Loop: pending tests get a fresh throwaway address → awaiting_payment tests
// are scanned until a payment lands (received) or they time out (expired).
import { setTimeout as sleep } from "node:timers/promises";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import zcash from "@ledgerhq/zcash-utils";
import { createDb, tests, type Db } from "@zecproof/db";
import { GRPC_URL, POLL_INTERVAL_MS, TEST_TTL_HOURS, requireMnemonic } from "./config";
import { connect, getLightdInfo } from "./lightwalletd";
import { deriveTestKeys } from "./keys";
import { findFirstReceipt } from "./scanner";

const once = process.argv.includes("--once");

async function assignPending(db: Db, mnemonic: string, tip: number) {
  await db.transaction(async (tx) => {
    const pending = await tx
      .select()
      .from(tests)
      .where(eq(tests.status, "pending"))
      .orderBy(asc(tests.createdAt))
      .limit(20)
      .for("update", { skipLocked: true });

    for (const test of pending) {
      const [{ n }] = await tx.execute<{ n: string }>(sql`select nextval('test_account_index_seq') as n`);
      const accountIndex = Number(n);
      const keys = deriveTestKeys(mnemonic, accountIndex, test.addressType);
      await tx
        .update(tests)
        .set({
          status: "awaiting_payment",
          accountIndex,
          ufvk: keys.ufvk,
          receiveAddress: keys.receiveAddress,
          transparentAddress: keys.transparentAddress ?? null,
          birthdayHeight: tip,
          scannedToHeight: tip - 1,
          assignedAt: new Date(),
          expiresAt: new Date(Date.now() + TEST_TTL_HOURS * 3600_000),
        })
        .where(eq(tests.id, test.id));
      console.log(`assigned  ${test.id}  ${test.addressType}  account ${accountIndex}  ${keys.receiveAddress}`);
    }
  });
}

async function expireStale(db: Db) {
  const expired = await db
    .update(tests)
    .set({ status: "expired" })
    .where(and(eq(tests.status, "awaiting_payment"), lt(tests.expiresAt, new Date())))
    .returning({ id: tests.id });
  for (const { id } of expired) console.log(`expired   ${id}`);
}

async function scanAwaiting(db: Db, client: ReturnType<typeof connect>, tip: number) {
  const awaiting = await db.select().from(tests).where(eq(tests.status, "awaiting_payment"));
  for (const test of awaiting) {
    try {
      const receipt = await findFirstReceipt(client, test, tip);
      if (receipt) {
        await db
          .update(tests)
          .set({
            status: "received",
            receivedPool: receipt.pool,
            receivedTxid: receipt.txid,
            receivedHeight: receipt.height,
            receivedAmountZat: receipt.amountZat,
            receivedMemo: receipt.memo ?? null,
            receivedAt: new Date(),
            scannedToHeight: tip,
            error: null,
          })
          .where(eq(tests.id, test.id));
        console.log(`received  ${test.id}  → ${receipt.pool.toUpperCase()}  height ${receipt.height}  txid ${receipt.txid}`);
      } else {
        await db.update(tests).set({ scannedToHeight: tip, error: null }).where(eq(tests.id, test.id));
      }
    } catch (err) {
      // Leave the test watching; record the error for the UI and retry next cycle.
      const message = err instanceof Error ? err.message : String(err);
      await db.update(tests).set({ error: message }).where(eq(tests.id, test.id));
      console.error(`error     ${test.id}  ${message}`);
    }
  }
}

async function main() {
  const mnemonic = requireMnemonic();
  const client = connect(GRPC_URL);
  const info = await getLightdInfo(client);
  if (info.chainName !== "test") {
    throw new Error(`Endpoint ${GRPC_URL} reports chain "${info.chainName}", not "test". Refusing to run.`);
  }
  console.log(`worker    ${GRPC_URL}  (${info.vendor} ${info.version}, chain=${info.chainName})`);

  const db = createDb();
  for (;;) {
    const tip = await zcash.getChainTip(GRPC_URL);
    await assignPending(db, mnemonic, tip);
    await expireStale(db);
    await scanAwaiting(db, client, tip);
    if (once) break;
    await sleep(POLL_INTERVAL_MS);
  }
  client.close();
  await db.$client.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
