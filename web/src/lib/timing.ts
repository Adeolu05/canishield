// Withdrawal timing (docs/SPEC-deposits-and-timing.md, section 4).
//
// requestedAt: what the tester says they clicked "withdraw" at (tester-reported).
// blockTime:   header time of the block the payment landed in (on-chain).
// The difference is "time to chain". Block header times can be a minute or
// two off wall-clock time, so anything under 3 minutes reads "under 3 min".
import type { Test } from "@zecproof/db";

/** Block header times may run ahead of real time; allow this much skew. */
export const CLOCK_SKEW_MS = 5 * 60_000;
const UNDER_MS = 3 * 60_000;

type Timed = Pick<Test, "requestedAt" | "blockTime">;

/** Milliseconds from request to block, or null when either is missing or the pair is implausible. */
export function timeToChainMs(t: Timed): number | null {
  if (!t.requestedAt || !t.blockTime) return null;
  const ms = t.blockTime.getTime() - t.requestedAt.getTime();
  if (ms < -CLOCK_SKEW_MS) return null; // request after the block: not a usable measurement
  return Math.max(0, ms);
}

/** "under 3 min", "14 min", "2 h 10 min", "1 d 3 h". */
export function formatDuration(ms: number): string {
  if (ms < UNDER_MS) return "under 3 min";
  const min = Math.round(ms / 60_000);
  if (min < 90) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) {
    const rest = min - h * 60;
    return rest ? `${h} h ${rest} min` : `${h} h`;
  }
  const d = Math.floor(h / 24);
  const restH = h - d * 24;
  return restH ? `${d} d ${restH} h` : `${d} d`;
}

export interface TimingSummary {
  count: number;
  medianMs: number;
  minMs: number;
  maxMs: number;
}

/** Median and range over the tests that have a usable measurement; null if none. */
export function summarizeTiming(tests: Timed[]): TimingSummary | null {
  const ms = tests.map(timeToChainMs).filter((v): v is number => v != null).sort((a, b) => a - b);
  if (ms.length === 0) return null;
  const mid = Math.floor(ms.length / 2);
  const medianMs = ms.length % 2 ? ms[mid] : Math.round((ms[mid - 1] + ms[mid]) / 2);
  return { count: ms.length, medianMs, minMs: ms[0], maxMs: ms[ms.length - 1] };
}

/** "14 min" for one result; "14 min (median of 3, 9 min to 22 min)" for several. */
export function describeTiming(s: TimingSummary): string {
  if (s.count === 1) return formatDuration(s.medianMs);
  const range = s.minMs === s.maxMs ? "" : `, ${formatDuration(s.minMs)} to ${formatDuration(s.maxMs)}`;
  return `${formatDuration(s.medianMs)} (median of ${s.count}${range})`;
}

export type RequestedAtResult = { ok: true; value: Date } | { ok: false; error: string };

/**
 * Validates the tester's request time. `local` is a datetime-local value
 * ("2026-11-05T14:32"), `tzOffsetMinutes` the browser's getTimezoneOffset()
 * at that moment (minutes to ADD to local time to get UTC, so Lagos is -60).
 */
export function parseRequestedAt(
  local: string | null,
  tzOffsetMinutes: string | null,
  test: Pick<Test, "assignedAt" | "blockTime">,
  now = new Date(),
): RequestedAtResult {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local ?? "");
  if (!m) return { ok: false, error: "Enter the date and time you clicked withdraw." };
  const offset = Number(tzOffsetMinutes);
  if (tzOffsetMinutes == null || tzOffsetMinutes === "" || !Number.isInteger(offset) || Math.abs(offset) > 14 * 60) {
    return { ok: false, error: "Your browser didn't send its timezone. Reload the page and try again." };
  }
  const [, y, mo, d, h, mi] = m.map(Number);
  // Reject values Date.UTC would silently roll over (Feb 30, 25:00).
  const asLocal = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (
    asLocal.getUTCFullYear() !== y ||
    asLocal.getUTCMonth() !== mo - 1 ||
    asLocal.getUTCDate() !== d ||
    asLocal.getUTCHours() !== h ||
    asLocal.getUTCMinutes() !== mi
  ) {
    return { ok: false, error: "That date and time isn't valid." };
  }
  const value = new Date(asLocal.getTime() + offset * 60_000);
  if (value.getTime() > now.getTime() + CLOCK_SKEW_MS) return { ok: false, error: "That time is in the future." };
  if (test.assignedAt && value.getTime() < test.assignedAt.getTime() - CLOCK_SKEW_MS) {
    return { ok: false, error: "That's before this test's address existed. Check the date and time." };
  }
  if (test.blockTime && value.getTime() > test.blockTime.getTime() + CLOCK_SKEW_MS) {
    return { ok: false, error: "That's after the payment landed on-chain. Check the date and time." };
  }
  return { ok: true, value };
}
