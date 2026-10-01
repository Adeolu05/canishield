// ZecProof scanner worker (testnet only).
//
// Loop: pending tests get a fresh throwaway address → awaiting_payment tests
// are scanned until a payment lands (received) or they time out (expired).
import { setTimeout as sleep } from "node:timers/promises";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import { createDb, tests, type Db } from "@zecproof/db";
import { POLL_INTERVAL_MS, TEST_TTL_HOURS, requireMnemonic } from "./config";
import { WrongChainError, closeEndpoints, openEndpoints, pickEndpoint, type HealthyEndpoint } from "./endpoints";
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

/** Pending tests that never got an address (e.g. the worker was down). */
async function expireUnassigned(db: Db) {
  const cutoff = new Date(Date.now() - TEST_TTL_HOURS * 3600_000);
  const expired = await db
    .update(tests)
    .set({ status: "expired" })
    .where(and(eq(tests.status, "pending"), lt(tests.createdAt, cutoff)))
    .returning({ id: tests.id });
  for (const { id } of expired) console.log(`expired   ${id}  (never assigned)`);
}

/** Awaiting tests past their deadline. Runs after the cycle's last scan. */
async function expireUnpaid(db: Db) {
  const expired = await db
    .update(tests)
    .set({ status: "expired" })
    .where(and(eq(tests.status, "awaiting_payment"), lt(tests.expiresAt, new Date())))
    .returning({ id: tests.id });
  for (const { id } of expired) console.log(`expired   ${id}  (no payment)`);
}

async function scanAwaiting(db: Db, endpoint: HealthyEndpoint) {
  const { tip } = endpoint;
  const awaiting = await db.select().from(tests).where(eq(tests.status, "awaiting_payment"));
  for (const test of awaiting) {
    try {
      const receipt = await findFirstReceipt(endpoint, test);
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
  const endpoints = openEndpoints();
  console.log(`worker    endpoints: ${endpoints.map((e) => e.url).join(", ")}`);

  const db = createDb();
  let lastUrl: string | undefined;
  for (;;) {
    let endpoint: HealthyEndpoint | undefined;
    try {
      endpoint = await pickEndpoint(endpoints);
    } catch (err) {
      if (err instanceof WrongChainError) throw err; // never fall through to another chain
      console.error(`error     ${err instanceof Error ? err.message : err}`);
    }
    // Expire stale pending tests before assigning, so they never get an address.
    await expireUnassigned(db);
    if (endpoint) {
      if (endpoint.url !== lastUrl) console.log(`using     ${endpoint.url} (tip ${endpoint.tip})`);
      lastUrl = endpoint.url;
      await assignPending(db, mnemonic, endpoint.tip);
      await scanAwaiting(db, endpoint);
    }
    // After the scan, so a payment that landed before the deadline still counts.
    // Needs no chain access, so it also runs when every endpoint is down.
    await expireUnpaid(db);
    if (once) break;
    await sleep(POLL_INTERVAL_MS);
  }
  closeEndpoints(endpoints);
  await db.$client.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
