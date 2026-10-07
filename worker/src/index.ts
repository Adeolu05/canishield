// CanIShield scanner worker. One process serves one network (testnet by default).
//
// Each cycle:
//   expire never-assigned tests → assign addresses to pending tests →
//   scan awaiting tests → confirm seen payments (depth + explorer) →
//   expire unpaid tests
import { setTimeout as sleep } from "node:timers/promises";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import { createDb, keyPool, tests, workerHeartbeats, type Db } from "@zecproof/db";
import { ConfigError, POLL_INTERVAL_MS, loadConfig, requireTestMnemonic, type WorkerConfig } from "./config";
import { WrongChainError, closeEndpoints, openEndpoints, pickEndpoint, type HealthyEndpoint } from "./endpoints";
import { confirmOnExplorer } from "./explorer";
import { addressesForType, deriveTestKeys, type TestKeys } from "./keys";
import { takePoolKey } from "./pool";
import { findFirstReceipt } from "./scanner";

const once = process.argv.includes("--once");

async function assignPending(db: Db, cfg: WorkerConfig, endpoint: HealthyEndpoint, mnemonic?: string) {
  const { network, testTtlHours } = cfg;
  await db.transaction(async (tx) => {
    const pending = await tx
      .select()
      .from(tests)
      .where(and(eq(tests.network, network), eq(tests.status, "pending")))
      .orderBy(asc(tests.createdAt))
      .limit(20)
      .for("update", { skipLocked: true });

    for (const test of pending) {
      let keys: TestKeys;
      let source: { accountIndex: number } | { keyId: string };
      if (cfg.keySource === "derived") {
        const [{ n }] = await tx.execute<{ n: string }>(sql`select nextval('test_account_index_seq') as n`);
        keys = deriveTestKeys(mnemonic!, Number(n), test.addressType);
        source = { accountIndex: Number(n) };
      } else {
        const key = await takePoolKey(tx, endpoint, network);
        if (!key) {
          await tx.update(tests).set({ error: `No unused ${network} keys in the pool. Import a new batch.` }).where(eq(tests.id, test.id));
          console.error(`pool      empty: ${test.id} stays pending`);
          return;
        }
        keys = { ufvk: key.ufvk, ...addressesForType(key, test.addressType) };
        source = { keyId: key.id };
      }
      await tx
        .update(tests)
        .set({
          status: "awaiting_payment",
          ...source,
          ufvk: keys.ufvk,
          receiveAddress: keys.receiveAddress,
          transparentAddress: keys.transparentAddress ?? null,
          birthdayHeight: endpoint.tip,
          scannedToHeight: endpoint.tip - 1,
          assignedAt: new Date(),
          expiresAt: new Date(Date.now() + testTtlHours * 3600_000),
          error: null,
        })
        .where(eq(tests.id, test.id));
      const label = "accountIndex" in source ? `account ${source.accountIndex}` : `pool key ${source.keyId}`;
      console.log(`assigned  ${test.id}  ${test.addressType}  ${label}  ${keys.receiveAddress}`);
    }
  });
}

/** Liveness for the web app's scanner pill. Never allowed to stop a cycle. */
async function heartbeat(db: Db, cfg: WorkerConfig, endpoint: HealthyEndpoint) {
  const row = { network: cfg.network, tip: endpoint.tip, endpoint: endpoint.url, seenAt: new Date() };
  try {
    await db.insert(workerHeartbeats).values(row).onConflictDoUpdate({ target: workerHeartbeats.network, set: row });
  } catch (err) {
    console.warn(`heartbeat ${err instanceof Error ? err.message : err}`);
  }
}

/** Pending tests that never got an address (e.g. the worker was down). */
async function expireUnassigned(db: Db, cfg: WorkerConfig) {
  const cutoff = new Date(Date.now() - cfg.testTtlHours * 3600_000);
  const expired = await db
    .update(tests)
    .set({ status: "expired" })
    .where(and(eq(tests.network, cfg.network), eq(tests.status, "pending"), lt(tests.createdAt, cutoff)))
    .returning({ id: tests.id });
  for (const { id } of expired) console.log(`expired   ${id}  (never assigned)`);
}

/** Awaiting tests past their deadline. Runs after the cycle's last scan. */
async function expireUnpaid(db: Db, cfg: WorkerConfig) {
  const expired = await db
    .update(tests)
    .set({ status: "expired" })
    .where(and(eq(tests.network, cfg.network), eq(tests.status, "awaiting_payment"), lt(tests.expiresAt, new Date())))
    .returning({ id: tests.id });
  for (const { id } of expired) console.log(`expired   ${id}  (no payment)`);
}

async function scanAwaiting(db: Db, cfg: WorkerConfig, endpoint: HealthyEndpoint) {
  const { tip } = endpoint;
  const awaiting = await db
    .select()
    .from(tests)
    .where(and(eq(tests.network, cfg.network), eq(tests.status, "awaiting_payment")));
  for (const test of awaiting) {
    try {
      const receipt = await findFirstReceipt(endpoint, cfg.network, test);
      if (receipt) {
        // Seen, not yet verified: confirmations and (if required) the explorer come next.
        await db
          .update(tests)
          .set({
            status: "confirming",
            receivedPool: receipt.pool,
            receivedTxid: receipt.txid,
            receivedHeight: receipt.height,
            receivedBlockHash: receipt.blockHash ?? null,
            receivedAmountZat: receipt.amountZat,
            receivedMemo: receipt.memo ?? null,
            scannedToHeight: tip,
            error: null,
          })
          .where(eq(tests.id, test.id));
        console.log(`seen      ${test.id}  → ${receipt.pool.toUpperCase()}  height ${receipt.height}  txid ${receipt.txid}`);
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

/** Seen payments become verified once deep enough and, where required, explorer-confirmed. */
async function confirmSeen(db: Db, cfg: WorkerConfig, endpoint: HealthyEndpoint) {
  const seen = await db
    .select()
    .from(tests)
    .where(and(eq(tests.network, cfg.network), eq(tests.status, "confirming")));
  for (const test of seen) {
    const confirmations = endpoint.tip - test.receivedHeight! + 1;
    if (confirmations < cfg.requiredConfirmations) continue;
    let explorerName: string | null = null;
    if (cfg.explorerCheck) {
      const verdict = await confirmOnExplorer(
        cfg.network,
        { txid: test.receivedTxid!, height: test.receivedHeight!, blockHash: test.receivedBlockHash },
        cfg.requiredConfirmations,
      );
      if (verdict.kind !== "confirmed") {
        const prefix = verdict.kind === "disagrees" ? "Explorer disagrees" : "Waiting for explorer";
        await db.update(tests).set({ error: `${prefix} (${verdict.explorer}): ${verdict.reason}` }).where(eq(tests.id, test.id));
        console[verdict.kind === "disagrees" ? "error" : "log"](`${verdict.kind.padEnd(9)} ${test.id}  ${verdict.explorer}: ${verdict.reason}`);
        continue;
      }
      explorerName = verdict.explorer;
    }
    await db
      .update(tests)
      .set({
        status: "received",
        receivedAt: new Date(),
        explorerName,
        explorerConfirmedAt: explorerName ? new Date() : null,
        error: null,
      })
      .where(eq(tests.id, test.id));
    console.log(`verified  ${test.id}  ${confirmations} confirmations${explorerName ? `, confirmed on ${explorerName}` : ""}`);
  }
}

async function main() {
  const cfg = loadConfig();
  const mnemonic = cfg.keySource === "derived" ? requireTestMnemonic() : undefined;
  const endpoints = openEndpoints(cfg.grpcUrls);
  console.log(
    `worker    network=${cfg.network} keys=${cfg.keySource} confirmations=${cfg.requiredConfirmations} explorer=${cfg.explorerCheck ? "on" : "off"}`,
  );
  console.log(`          endpoints: ${endpoints.map((e) => e.url).join(", ")}`);

  const db = createDb();
  if (cfg.keySource === "pool") {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(keyPool)
      .where(and(eq(keyPool.network, cfg.network), eq(keyPool.status, "available")));
    console.log(`          ${n} unused ${cfg.network} pool key(s)`);
  }

  let lastUrl: string | undefined;
  for (;;) {
    let endpoint: HealthyEndpoint | undefined;
    try {
      endpoint = await pickEndpoint(endpoints, cfg.profile.chainName);
    } catch (err) {
      if (err instanceof WrongChainError) throw err; // never fall through to another chain
      console.error(`error     ${err instanceof Error ? err.message : err}`);
    }
    // Expire stale pending tests before assigning, so they never get an address.
    await expireUnassigned(db, cfg);
    if (endpoint) {
      if (endpoint.url !== lastUrl) console.log(`using     ${endpoint.url} (tip ${endpoint.tip})`);
      lastUrl = endpoint.url;
      await heartbeat(db, cfg, endpoint);
      await assignPending(db, cfg, endpoint, mnemonic);
      await scanAwaiting(db, cfg, endpoint);
      await confirmSeen(db, cfg, endpoint);
    }
    // After the scan, so a payment that landed before the deadline still counts.
    // Needs no chain access, so it also runs when every endpoint is down.
    await expireUnpaid(db, cfg);
    if (once) break;
    await sleep(POLL_INTERVAL_MS);
  }
  closeEndpoints(endpoints);
  await db.$client.end();
}

main().catch((err) => {
  console.error(err instanceof ConfigError ? `Config: ${err.message}` : err instanceof Error ? err.message : err);
  process.exit(1);
});
