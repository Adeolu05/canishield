// The worker's deposit-check step: verify submitted txids on-chain, and expire
// checks nobody finished. Runs after the test work; never fails a cycle.
import { and, eq, inArray, lt } from "drizzle-orm";
import { depositChecks, type Db } from "@zecproof/db";
import { depositHmac } from "@zecproof/zcash/deposit";
import type { WorkerConfig } from "./config";
import type { Fetch } from "./explorer";
import { fetchTx, verifyDeposit, type ZbTx } from "./deposits";

const PER_CYCLE = 5;
/** A txid that never shows up on-chain is given up on after this long. */
const NOT_FOUND_AFTER_MS = 48 * 3600_000;
/** After the payment is verified, the tester has this long to report whether it was credited. */
export const REPORT_WINDOW_MS = 7 * 86_400_000;
/** Most transparent inputs we follow back for a two-step (TEX) payment. */
const MAX_INPUTS = 20;

/** Clearing these keeps a refused or expired check from holding anything that links it to the tester. */
const CLEAR_PRIVATE = { txid: null, checkAmountZat: null, height: null, evidenceUrl: null } as const;

let warnedNoSecret = false;

export async function depositStep(
  db: Db,
  cfg: Pick<WorkerConfig, "network" | "requiredConfirmations" | "profile">,
  env: Record<string, string | undefined> = process.env,
  fetchFn: Fetch = fetch,
) {
  try {
    // Expire what nobody finished: no txid in time, or no credit report in time.
    const expired = await db
      .update(depositChecks)
      .set({ status: "expired", ...CLEAR_PRIVATE, updatedAt: new Date() })
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

    const pending = await db
      .select()
      .from(depositChecks)
      .where(and(eq(depositChecks.network, cfg.network), eq(depositChecks.status, "verifying")))
      .orderBy(depositChecks.updatedAt)
      .limit(PER_CYCLE);

    for (const check of pending) {
      try {
        if (!check.txid || check.checkAmountZat == null) {
          await refuse(db, check.id, "The check is missing its txid or amount. Start a new check.");
          continue;
        }
        const found = await fetchTx(cfg.network, check.txid, fetchFn);
        if (found.kind === "unavailable") continue; // explorer down: next cycle
        if (found.kind === "missing") {
          // updatedAt is when the txid was submitted (status moved to verifying).
          if (Date.now() - check.updatedAt.getTime() > NOT_FOUND_AFTER_MS) await refuse(db, check.id, "We couldn't find this transaction on-chain within 48 hours.");
          continue;
        }
        const prev = new Map<string, ZbTx>();
        let verdict = verifyDeposit(check as typeof check & { checkAmountZat: number }, found.tx, prev, cfg.requiredConfirmations, hmac);
        if (verdict.kind === "need") {
          if (verdict.txids.length > MAX_INPUTS) {
            await refuse(db, check.id, "This transaction has too many transparent inputs to trace back to a shielded wallet.");
            continue;
          }
          let complete = true;
          for (const id of verdict.txids) {
            const p = await fetchTx(cfg.network, id, fetchFn);
            if (p.kind !== "found") {
              complete = false;
              break;
            }
            prev.set(id, p.tx);
          }
          if (!complete) continue; // try again next cycle
          verdict = verifyDeposit(check as typeof check & { checkAmountZat: number }, found.tx, prev, cfg.requiredConfirmations, hmac);
        }
        if (verdict.kind === "wait" || verdict.kind === "need") continue;
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
            expiresAt: new Date(Date.now() + REPORT_WINDOW_MS),
            updatedAt: new Date(),
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
    .set({ status: "refused", refusedReason: reason, ...CLEAR_PRIVATE, updatedAt: new Date() })
    .where(and(eq(depositChecks.id, id), eq(depositChecks.status, "verifying")));
  console.log(`deposit   ${id}  refused: ${reason}`);
}
