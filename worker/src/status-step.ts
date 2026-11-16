// The worker's live-status step: every few minutes, read each exchange's public
// ZEC deposit/withdrawal status (status-sources.ts) into funding_status, and
// record confirmed open/paused changes in funding_events for the site's feed
// and the optional Telegram alerts. Mainnet worker only. Runs last in a cycle,
// with short timeouts, and never fails the cycle or holds up the scanner.
import { inArray } from "drizzle-orm";
import { fundingEvents, fundingStatus, services, type Db, type FundingStatus } from "@zecproof/db";
import type { WorkerConfig } from "./config";
import type { Fetch } from "./explorer";
import { SOURCES, readSource, type FundingState, type SourceResult, type StatusSource } from "./status-sources";
import { notifyEvents } from "./telegram";

/** How often the exchanges are asked: one request each (two for none), so far below any rate limit. */
export const STATUS_INTERVAL_MS = 5 * 60_000;

type Side = "deposit" | "withdraw";
type Known = Exclude<FundingState, "unknown">;

export interface SideState {
  shown: FundingState;
  /** Last raw reading; null before the first one. */
  seen: FundingState | null;
  known: Known | null;
}

export interface SideChange {
  next: SideState;
  /** A confirmed change between open and paused, if this reading made one. */
  event: { from: Known; to: Known } | null;
}

/**
 * One side's next state. A reading becomes the shown state only when it matches
 * the previous reading (two in a row). Events are announced against the last
 * known state, so open -> unknown -> paused is one event (open to paused) and
 * open -> unknown -> open is none.
 */
export function nextSide(prev: SideState, reading: FundingState): SideChange {
  const shown = reading === prev.seen ? reading : prev.shown;
  let known = prev.known;
  let event: SideChange["event"] = null;
  if (shown !== "unknown") {
    if (known !== null && known !== shown) event = { from: known, to: shown };
    known = shown;
  }
  return { next: { shown, seen: reading, known }, event };
}

export function sideOf(row: FundingStatus | undefined, side: Side): SideState {
  if (!row) return { shown: "unknown", seen: null, known: null };
  return side === "deposit"
    ? { shown: row.deposit as FundingState, seen: row.seenDeposit as FundingState, known: row.knownDeposit as Known | null }
    : { shown: row.withdraw as FundingState, seen: row.seenWithdraw as FundingState, known: row.knownWithdraw as Known | null };
}

let lastRunAt = 0;
let warnedMissing = new Set<string>();

/** For tests: forget when the step last ran. */
export function resetStatusClock() {
  lastRunAt = 0;
  warnedMissing = new Set();
}

export async function statusStep(
  db: Db,
  cfg: Pick<WorkerConfig, "network">,
  env: Record<string, string | undefined> = process.env,
  fetchFn: Fetch = fetch,
  sources: readonly StatusSource[] = SOURCES,
  now = () => new Date(),
) {
  if (cfg.network !== "mainnet" || env.ZECPROOF_STATUS_CHECKS === "off") return;
  const started = now();
  if (started.getTime() - lastRunAt < STATUS_INTERVAL_MS) return;
  lastRunAt = started.getTime();
  try {
    const rows = await db
      .select({ id: services.id, slug: services.slug })
      .from(services)
      .where(inArray(services.slug, sources.map((s) => s.slug)));
    const idOf = new Map(rows.map((r) => [r.slug, r.id]));
    const ids = rows.map((r) => r.id);
    const existing = ids.length ? await db.select().from(fundingStatus).where(inArray(fundingStatus.serviceId, ids)) : [];
    const prevOf = new Map(existing.map((r) => [r.serviceId, r]));

    // Different hosts, so in parallel: the whole read takes one timeout at most.
    const results = await Promise.all(sources.map(async (src) => [src, await readSource(src, fetchFn)] as const));

    const summary: string[] = [];
    for (const [src, result] of results) {
      const serviceId = idOf.get(src.slug);
      if (!serviceId) {
        if (!warnedMissing.has(src.slug)) console.warn(`status    no service with slug "${src.slug}"; skipped`);
        warnedMissing.add(src.slug);
        continue;
      }
      summary.push(`${src.slug} ${describe(result)}`);
      try {
        await save(db, serviceId, src, result, prevOf.get(serviceId), now());
      } catch (err) {
        console.error(`status    ${src.slug}: could not save (${err instanceof Error ? err.message.slice(0, 120) : "error"})`);
      }
    }
    console.log(`status    ${summary.join(", ")}`);
    await notifyEvents(db, env, fetchFn, now());
  } catch (err) {
    console.error(`status    step failed, trying again in ${STATUS_INTERVAL_MS / 60_000} min: ${err instanceof Error ? err.message.slice(0, 160) : "error"}`);
  }
}

function describe(r: SourceResult): string {
  return r.ok ? `${r.reading.deposit}/${r.reading.withdraw}` : `unknown (${r.reason})`;
}

async function save(db: Db, serviceId: string, src: StatusSource, result: SourceResult, prev: FundingStatus | undefined, at: Date) {
  const reading = result.ok ? result.reading : { deposit: "unknown" as const, withdraw: "unknown" as const, confirmations: null, note: null };
  const dep = nextSide(sideOf(prev, "deposit"), reading.deposit);
  const wd = nextSide(sideOf(prev, "withdraw"), reading.withdraw);
  const changed = dep.next.shown !== (prev?.deposit ?? "unknown") || wd.next.shown !== (prev?.withdraw ?? "unknown");

  const values = {
    source: src.label.slice(0, 80),
    deposit: dep.next.shown,
    withdraw: wd.next.shown,
    seenDeposit: dep.next.seen ?? "unknown",
    seenWithdraw: wd.next.seen ?? "unknown",
    knownDeposit: dep.next.known,
    knownWithdraw: wd.next.known,
    // A failed read keeps the last good extras; a good read replaces them.
    confirmations: result.ok ? result.reading.confirmations : (prev?.confirmations ?? null),
    note: result.ok ? (result.reading.note?.slice(0, 80) ?? null) : (prev?.note ?? null),
    lastOkAt: result.ok ? at : (prev?.lastOkAt ?? null),
    lastError: result.ok ? null : result.reason.slice(0, 120),
    checkedAt: at,
    changedAt: changed ? at : (prev?.changedAt ?? null),
  };

  const events = [
    dep.event && { serviceId, side: "deposit", fromState: dep.event.from, toState: dep.event.to, at },
    wd.event && { serviceId, side: "withdraw", fromState: wd.event.from, toState: wd.event.to, at },
  ].filter((e): e is NonNullable<typeof e> => e !== null);

  await db.transaction(async (tx) => {
    await tx
      .insert(fundingStatus)
      .values({ serviceId, ...values })
      .onConflictDoUpdate({ target: fundingStatus.serviceId, set: values });
    if (events.length) await tx.insert(fundingEvents).values(events);
  });
  for (const e of events) console.log(`status    ${src.slug}: ZEC ${e.side === "deposit" ? "deposits" : "withdrawals"} ${e.fromState} -> ${e.toState}`);
}
