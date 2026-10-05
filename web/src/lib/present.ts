// Presentation only: how evidence is shown (icon, tone, words, dates).
// Evidence semantics live in ./evidence and are not changed here.
import type { AddressType, Pool, Report, ReportOutcome, ResearchClaimRow, Test } from "@zecproof/db";
import { LISTED_CLAIM, READINESS, reportDate, sourceName, testDate, type Cell, type Readiness } from "./evidence";
import { RESEARCH_CLAIM, researchSource, resolutionFor } from "./research";

export type Tone = "ok" | "shield" | "warn" | "bad" | "info" | "listed" | "neutral";

/** Icon keys resolve to lucide icons in components/status.tsx. */
export type IconKey =
  | "shield-check"
  | "clipboard-check"
  | "shield"
  | "eye"
  | "x-circle"
  | "check-circle"
  | "file-text"
  | "circle-dashed"
  | "badge-check"
  | "users"
  | "clock";

export const OUTCOME_VISUAL: Record<ReportOutcome, { tone: Tone; icon: IconKey; label: string }> = {
  ironwood: { tone: "ok", icon: "shield-check", label: "Ironwood" },
  orchard: { tone: "shield", icon: "shield", label: "Orchard" },
  sapling: { tone: "shield", icon: "shield", label: "Sapling" },
  transparent: { tone: "warn", icon: "eye", label: "Transparent" },
  address_rejected: { tone: "bad", icon: "x-circle", label: "Address rejected" },
  // Only the form took the address; nothing was sent. Never a verification.
  form_accepted: { tone: "info", icon: "clipboard-check", label: "Form accepted (not submitted)" },
};

export const READINESS_VISUAL: Record<Readiness, { tone: Tone; icon: IconKey; label: string; meaning: string }> = {
  ironwood: { tone: "ok", icon: "shield-check", ...READINESS.ironwood },
  shielded_other: { tone: "shield", icon: "shield", ...READINESS.shielded_other },
  transparent_only: { tone: "warn", icon: "eye", ...READINESS.transparent_only },
  rejected: { tone: "bad", icon: "x-circle", ...READINESS.rejected },
  untested: { tone: "neutral", icon: "circle-dashed", ...READINESS.untested },
};

export const READINESS_ORDER: Readiness[] = ["ironwood", "shielded_other", "transparent_only", "rejected", "untested"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 2" this year, "Oct 2, 2025" otherwise. UTC, so server and client agree. */
export function shortDate(d: Date, now = new Date()): string {
  const base = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return d.getUTCFullYear() === now.getUTCFullYear() ? base : `${base}, ${d.getUTCFullYear()}`;
}

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Serializable cell for the client board. */
export interface CellView {
  tier: "verified" | "community" | "listing" | "none";
  tone: Tone;
  icon: IconKey;
  label: string;
  /** "Verified Oct 2" / "Reported Oct 2" / "Listing read Oct 2". */
  dateLabel?: string;
  dateIso?: string;
  stale: boolean;
  pendingReview: boolean;
  source?: string;
}

const DATE_VERB = { verified: "Verified", community: "Reported", listing: "Listing read" } as const;

export function cellView(cell: Cell, now = new Date()): CellView {
  if (cell.tier === "none") {
    return { tier: "none", tone: "neutral", icon: "circle-dashed", label: "Untested", stale: false, pendingReview: false };
  }
  const dated = { dateLabel: `${DATE_VERB[cell.tier]} ${shortDate(cell.date, now)}`, dateIso: isoDay(cell.date), stale: cell.stale };
  if (cell.tier === "listing") {
    return {
      tier: "listing",
      tone: "listed",
      icon: "file-text",
      label: LISTED_CLAIM[cell.report.outcome].label,
      source: sourceName(cell.report.sourceUrl),
      pendingReview: false,
      ...dated,
    };
  }
  const outcome = cell.tier === "verified" ? (cell.test.receivedPool as Pool) : cell.report.outcome;
  const v = OUTCOME_VISUAL[outcome];
  return {
    tier: cell.tier,
    tone: v.tone,
    icon: v.icon,
    label: v.label,
    pendingReview: cell.tier === "community" && cell.report.status === "unreviewed",
    ...dated,
  };
}

/** The strongest tier anywhere in a service's row. */
export function strongestTier(cells: CellView[]): CellView["tier"] {
  for (const tier of ["verified", "community", "listing"] as const) if (cells.some((c) => c.tier === tier)) return tier;
  return "none";
}

export interface Verdict {
  tone: Tone;
  icon: IconKey;
  title: string;
  detail: string;
}

const UA_TYPES: AddressType[] = ["ironwood_ua", "full_ua"];
const latest = <T>(xs: T[], date: (x: T) => Date) => xs.map(date).sort((a, b) => b.getTime() - a.getTime())[0];

/** Plain-language verdict for a service page, e.g. "Transparent only: rejected unified addresses, Oct 2". */
export function verdictFor(
  readiness: Readiness,
  verified: Test[],
  visible: Report[],
  now = new Date(),
  research: Pick<ResearchClaimRow, "claim" | "source" | "serviceId" | "readAt">[] = [],
): Verdict {
  const v = READINESS_VISUAL[readiness];
  const d = (x: Date | undefined) => (x ? shortDate(x, now) : "");
  const uaRejections = visible.filter(
    (r) => r.tier === "community" && r.outcome === "address_rejected" && r.addressType && UA_TYPES.includes(r.addressType),
  );
  switch (readiness) {
    case "ironwood":
      return { ...v, title: "Ironwood-ready", detail: `a shielded payment landed in Ironwood, ${d(latest(verified.filter((t) => t.receivedPool === "ironwood"), testDate))}` };
    case "shielded_other": {
      const t = verified.find((x) => x.receivedPool === "sapling" || x.receivedPool === "orchard")!;
      return { ...v, title: "Shielded, not Ironwood", detail: `a shielded payment landed in ${OUTCOME_VISUAL[t.receivedPool!].label}, ${d(testDate(t))}` };
    }
    case "transparent_only":
      return uaRejections.length
        ? { ...v, title: "Transparent only", detail: `rejected unified addresses, ${d(latest(uaRejections, reportDate))}` }
        : { ...v, title: "Transparent only", detail: `paid the transparent receiver of a unified address, ${d(latest(verified, testDate))}` };
    case "rejected":
      return { ...v, title: "Rejects unified addresses", detail: `reported ${d(latest(uaRejections, reportDate))}; no payment verified yet` };
    case "untested": {
      // Each source's claim in its own clause: never merged, never ranked.
      const listings = visible.filter((r) => r.tier === "listing");
      const parts: string[] = [];
      if (listings.length) {
        const claims = [...new Set(listings.map((r) => LISTED_CLAIM[r.outcome].label.replace(/^Listed: /, "")))];
        parts.push(`${sourceName(listings[0].sourceUrl)} lists it as ${claims.join(", ")}`);
      }
      for (const r of research) {
        const resolved = resolutionFor(r, visible);
        parts.push(
          resolved
            ? `${researchSource(r.source).name} found it not listed, since resolved: ${resolved.text.toLowerCase()}, ${d(resolved.date)}`
            : `${researchSource(r.source).name} says ${RESEARCH_CLAIM[r.claim].phrase}`,
        );
      }
      if (!parts.length) return { ...v, title: "Not tested yet", detail: "no on-chain or community evidence so far" };
      return { ...v, title: "Not tested yet", detail: `${parts.join("; ")} (${parts.length > 1 ? "all " : ""}unverified)` };
    }
  }
}

/** ZIP-321 payment URI for a test address. No amount: the tester sends the service's minimum. */
export const zip321Uri = (address: string) => `zcash:${address}`;
