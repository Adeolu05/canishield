// The worker's deposit-check step: verify submitted txids on-chain, and expire
// checks nobody finished. Runs after the test work, on its own time budget;
// never fails a cycle.
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { depositChecks, type Db } from "@zecproof/db";
import { depositHmac } from "@zecproof/zcash/deposit";
import type { WorkerConfig } from "./config";
import type { Fetch } from "./explorer";
import { fetchTx, verifyDeposit, type ZbTx } from "./deposits";

const PER_CYCLE = 5;
/** Stop looking up transactions after this long in one cycle, so the test work is never held up. */
const TIME_BUDGET_MS = 20_000;
/** A submitted txid that hasn't passed by then (not found, not mined, stuck, reorged) is given up on. */
export const VERIFY_DEADLINE_MS = 48 * 3600_000;
/** After the payment is verified, the tester has this long to report whether it was credited. */
export const REPORT_WINDOW_MS = 7 * 86_400_000;
/** Most transparent inputs we follow back for a two-step (TEX) payment. */
const MAX_INPUTS = 20;

/** Clearing these keeps a finished check from holding anything that links it to the tester. */
export const CLEAR_PRIVATE = { txid: null, checkAmountZat: null, height: null, evidenceUrl: null, addressHmac: null } as const;

let warnedNoSecret = false;

export async function depositStep(
  db: Db,
  cfg: Pick<WorkerConfig, "network" | "requiredConfirmations" | "profile">,
  env: Record<string, string | undefined> = process.env,
  fetchFn: Fetch = fetch,
) {
  const deadline = Date.now() + TIME_BUDGET_MS;
  try {
    // Expire what nobody finished: no txid in time, or no credit report in time.
    const expired = await db
      .update(depositChecks)
      .set({ status: "expired", ...CLEAR_PRIVATE })
      .where(and(eq(depositChecks.network, cfg.network), inArray(depositChecks.status, ["awaiting_tx", "onchain_ok"]), lt(depositChecks.expiresAt, new Date())))
      .returning({ id: depositChecks.id });
    for (const { id } of expired) console.log(`deposit   ${id}  expired`);

    const secret = env.ZECPROOF_DEPOSIT_SECRET ?? "";
    if (secret.length < 32) {
      if (!warnedNoSecret) console.warn("deposit   ZECPROOF_DEPOSIT_SECRET is not set (32+ characters): deposit checks are not verified");
      warnedNoSecret = true;
      return;
    }
    const hmac = (v: string) => depositHmac(secret, v);

    // Least recently checked first, so a few stuck checks can't starve the rest.
    const pending = await db
      .select()
      .from(depositChecks)
      .where(and(eq(depositChecks.network, cfg.network), eq(depositChecks.status, "verifying")))
      .orderBy(sql`${depositChecks.lastCheckedAt} ASC NULLS FIRST`, asc(depositChecks.txSubmittedAt))
      .limit(PER_CYCLE);

    for (const check of pending) {
      if (Date.now() > deadline) break;
      try {
        await db.update(depositChecks).set({ lastCheckedAt: new Date() }).where(eq(depositChecks.id, check.id));
        const submitted = check.txSubmittedAt ?? check.updatedAt;
        const overdue = Date.now() - submitted.getTime() > VERIFY_DEADLINE_MS;
        if (!check.txid || check.checkAmountZat == null || !check.addressHmac) {
          await refuse(db, check.id, "The check is missing its txid, amount or address. Start a new check.");
          continue;
        }
        const toVerify = { addressType: check.addressType, addressHmac: check.addressHmac, checkAmountZat: check.checkAmountZat, createdAt: check.createdAt };
        const found = await fetchTx(cfg.network, check.txid, fetchFn);
        if (found.kind !== "found") {
          // Explorer down or tx unknown: try again later, up to the deadline.
          if (overdue) await refuse(db, check.id, "We couldn't verify this transaction on-chain within 48 hours.");
          continue;
        }
        const prev = new Map<string, ZbTx>();
        let verdict = verifyDeposit(toVerify, found.tx, prev, cfg.requiredConfirmations, hmac);
        if (verdict.kind === "need") {
          if (verdict.txids.length > MAX_INPUTS) {
            await refuse(db, check.id, "This transaction has too many transparent inputs to trace back to a shielded wallet.");
            continue;
          }
          for (const id of verdict.txids) {
            const p = await fetchTx(cfg.network, id, fetchFn);
            if (p.kind === "found") prev.set(id, p.tx);
          }
          verdict = verifyDeposit(toVerify, found.tx, prev, cfg.requiredConfirmations, hmac);
        }
        if (verdict.kind === "wait" || verdict.kind === "need") {
          if (overdue) await refuse(db, check.id, "We couldn't verify this transaction on-chain within 48 hours.");
          continue;
        }
        if (verdict.kind === "refused") {
          await refuse(db, check.id, verdict.reason);
          continue;
        }
        await db
          .update(depositChecks)
          .set({
            status: "onchain_ok",
            source: verdict.source,
            height: verdict.height,
            afterNu7: verdict.height >= cfg.profile.nu7Height,
            blockTime: verdict.blockTime,
            destinationChecked: verdict.destinationVisible,
            expiresAt: new Date(Date.now() + REPORT_WINDOW_MS),
          })
          .where(and(eq(depositChecks.id, check.id), eq(depositChecks.status, "verifying")));
        console.log(`deposit   ${check.id}  on-chain ok (${verdict.source}${verdict.destinationVisible ? "" : ", destination not visible"})`);
      } catch (err) {
        console.warn(`deposit   ${check.id}  ${err instanceof Error ? err.message : err}`);
      }
    }
  } catch (err) {
    console.warn(`deposit   ${err instanceof Error ? err.message : err}`);
  }
}

async function refuse(db: Db, id: string, reason: string) {
  await db
    .update(depositChecks)
    .set({ status: "refused", refusedReason: reason, ...CLEAR_PRIVATE })
    .where(and(eq(depositChecks.id, id), eq(depositChecks.status, "verifying")));
  console.log(`deposit   ${id}  refused: ${reason}`);
}
