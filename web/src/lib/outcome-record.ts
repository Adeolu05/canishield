// Exit outcomes, Phase 2: what a service's record shows. Pure, so it can be unit tested.
//
// Privacy rule from the plan: a page always shows how many accepted reports a service has, the latest
// outcome and the week of the newest one. A report's details (amount range, route, days held, note) are
// shown only once the service has DETAIL_MIN accepted reports, or when the report links a public write-up
// (a forum thread the person posted themselves). One or two private reports can't be singled out.
import type { AmountBand, OutcomeResult, OutcomeRoute } from "@zecproof/db";
import type { IconKey, Tone } from "./present";

export const DETAIL_MIN = 3;

/** The columns of an accepted report that may ever leave the server. Never the evidence link or token hash. */
export type OutcomeRow = {
  id: string;
  serviceId: string;
  result: OutcomeResult;
  amountBand: AmountBand;
  route: OutcomeRoute;
  weekOf: string; // YYYY-MM-DD, a Monday
  daysHeld: number | null;
  creditMinutes: number | null;
  sourceUrl: string | null;
  note: string | null;
};

export const OUTCOME_RESULT_VISUAL: Record<OutcomeResult, { tone: Tone; icon: IconKey }> = {
  credited: { tone: "ok", icon: "check-circle" },
  held_then_credited: { tone: "warn", icon: "clock" },
  documents_requested: { tone: "warn", icon: "file-text" },
  rejected: { tone: "bad", icon: "x-circle" },
  refunded: { tone: "warn", icon: "circle-dashed" },
  held_open: { tone: "bad", icon: "clock" },
};

/** Results where the money did not simply arrive. */
export const TROUBLE: readonly OutcomeResult[] = ["held_then_credited", "documents_requested", "rejected", "refunded", "held_open"];

export type ServiceRecord = {
  total: number;
  counts: Partial<Record<OutcomeResult, number>>;
  latest: { result: OutcomeResult; weekOf: string } | null;
  detailed: boolean;
  /** Reports whose details may be shown, newest week first. */
  cases: OutcomeRow[];
  /** The newest public report credited without a hold, through a known route. */
  worked: { route: OutcomeRoute; weekOf: string } | null;
  trouble: number;
};

const newestFirst = (a: OutcomeRow, b: OutcomeRow) => (a.weekOf === b.weekOf ? 0 : a.weekOf < b.weekOf ? 1 : -1);

export function recordFor(rows: readonly OutcomeRow[]): ServiceRecord {
  const sorted = [...rows].sort(newestFirst);
  const counts: Partial<Record<OutcomeResult, number>> = {};
  for (const r of sorted) counts[r.result] = (counts[r.result] ?? 0) + 1;
  const detailed = sorted.length >= DETAIL_MIN;
  const cases = sorted.filter((r) => detailed || !!r.sourceUrl);
  const w = cases.find((r) => r.result === "credited" && r.route !== "unknown");
  return {
    total: sorted.length,
    counts,
    latest: sorted[0] ? { result: sorted[0].result, weekOf: sorted[0].weekOf } : null,
    detailed,
    cases,
    worked: w ? { route: w.route, weekOf: w.weekOf } : null,
    trouble: sorted.filter((r) => TROUBLE.includes(r.result)).length,
  };
}

/** The newest accepted outcomes across services, for the board. Only the result and week, never details. */
export function latestAcross<T extends OutcomeRow>(rows: readonly T[], n = 4): T[] {
  return [...rows].sort(newestFirst).slice(0, n);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "week of 20 Jul 2026" */
export function weekLabel(weekOf: string): string {
  const [y, m, d] = weekOf.split("-").map(Number);
  return `week of ${d} ${MONTHS[m - 1]} ${y}`;
}

/** Days held, phrased for the result it belongs to. */
export function heldPhrase(r: Pick<OutcomeRow, "result" | "daysHeld">): string | null {
  if (r.daysHeld == null) return null;
  const n = `${r.daysHeld} day${r.daysHeld === 1 ? "" : "s"}`;
  return r.result === "held_open" ? `held ${n} at the last update` : `held ${n}, then credited`;
}

/** The host of a public source, for its link text. */
export function sourceHost(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    return h === "forum.zcashcommunity.com" ? "Zcash forum" : h;
  } catch {
    return "source";
  }
}
