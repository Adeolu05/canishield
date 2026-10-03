// How evidence turns into board cells, staleness and Ironwood readiness.
// Pure functions: the board, the readiness panel and /api/results.json all
// use these, so they always agree.
import type { AddressType, Report, ReportOutcome, Service, Test } from "@zecproof/db";

/** docs/SPEC.md: a claim older than this shows as stale until retested. */
export const STALE_AFTER_DAYS = 30;
const DAY_MS = 86_400_000;

export const ADDRESS_TYPES: AddressType[] = ["ironwood_ua", "full_ua", "transparent"];
const SHIELDED_TYPES: AddressType[] = ["ironwood_ua", "full_ua"];

export type Cell =
  | { tier: "verified"; test: Test; date: Date; stale: boolean }
  | { tier: "community" | "listing"; report: Report; date: Date; stale: boolean }
  | { tier: "none" };

export const isStale = (date: Date, now: Date) => now.getTime() - date.getTime() > STALE_AFTER_DAYS * DAY_MS;

/** When the claim was last established: verified, observed (e.g. a form check) or reported, or (listings) when the source was read. */
export const testDate = (t: Test) => t.receivedAt ?? t.updatedAt;
export const reportDate = (r: Report) => (r.tier === "listing" ? (r.sourceReadAt ?? r.createdAt) : (r.observedAt ?? r.createdAt));

const newest = <T>(items: T[], date: (x: T) => Date) =>
  items.reduce<T | undefined>((best, x) => (!best || date(x) > date(best) ? x : best), undefined);

/**
 * The strongest evidence for one service × address type. On-chain verified
 * beats community reported beats unverified listing; within a tier, the
 * newest wins. Staleness is shown, not used to rank.
 */
export function bestCell(verified: Test[], visible: Report[], type: AddressType, now: Date): Cell {
  const test = newest(verified.filter((t) => t.addressType === type), testDate);
  if (test) return { tier: "verified", test, date: testDate(test), stale: isStale(testDate(test), now) };
  for (const tier of ["community", "listing"] as const) {
    const report = newest(visible.filter((r) => r.tier === tier && r.addressType === type), reportDate);
    if (report) return { tier, report, date: reportDate(report), stale: isStale(reportDate(report), now) };
  }
  return { tier: "none" };
}

export type Readiness = "ironwood" | "shielded_other" | "transparent_only" | "rejected" | "untested";

export const READINESS: Record<Readiness, { label: string; meaning: string }> = {
  ironwood: { label: "Verified Ironwood", meaning: "A payment was verified on-chain landing in the Ironwood pool." },
  shielded_other: {
    label: "Shielded, not Ironwood",
    meaning: "A verified shielded payment landed in an older pool (Sapling or Orchard).",
  },
  transparent_only: {
    label: "Transparent only",
    meaning: "Transparent payments verified, while unified addresses were rejected or the transparent receiver was paid instead.",
  },
  rejected: { label: "Rejected", meaning: "Unified addresses were rejected; no payment verified yet." },
  untested: {
    label: "Untested",
    meaning: "No on-chain or community evidence about shielded withdrawals yet (unverified listings don't count).",
  },
};

/**
 * One bucket per service, from on-chain and community evidence only.
 * Unverified listings never move a service out of "untested".
 */
export function readinessOf(verified: Test[], visible: Report[]): Readiness {
  const pools = new Set(verified.map((t) => t.receivedPool));
  if (pools.has("ironwood")) return "ironwood";
  if (pools.has("sapling") || pools.has("orchard")) return "shielded_other";
  const uaRejected = visible.some(
    (r) => r.tier === "community" && r.outcome === "address_rejected" && r.addressType && SHIELDED_TYPES.includes(r.addressType),
  );
  const fullUaPaidTransparent = verified.some((t) => t.addressType === "full_ua" && t.receivedPool === "transparent");
  if (pools.has("transparent") && (uaRejected || fullUaPaidTransparent)) return "transparent_only";
  if (uaRejected) return "rejected";
  return "untested";
}

export interface ServiceSummary {
  service: Service;
  cells: Record<AddressType, Cell>;
  readiness: Readiness;
  hasListing: boolean;
}

/** `verified` = received tests; `visible` = reports not rejected by an admin. */
export function summarize(allServices: Service[], verified: Test[], visible: Report[], now = new Date()) {
  const rows: ServiceSummary[] = allServices.map((service) => {
    const st = verified.filter((t) => t.serviceId === service.id);
    const sr = visible.filter((r) => r.serviceId === service.id);
    return {
      service,
      cells: Object.fromEntries(ADDRESS_TYPES.map((type) => [type, bestCell(st, sr, type, now)])) as Record<AddressType, Cell>,
      readiness: readinessOf(st, sr),
      hasListing: sr.some((r) => r.tier === "listing"),
    };
  });
  const counts = Object.fromEntries(Object.keys(READINESS).map((k) => [k, 0])) as Record<Readiness, number>;
  for (const r of rows) counts[r.readiness]++;
  return {
    rows,
    counts,
    total: rows.length,
    untestedWithListing: rows.filter((r) => r.readiness === "untested" && r.hasListing).length,
  };
}

// Unverified listings are claims, not results. They get their own wording and
// export codes so they can never be read as a test outcome.
export const LISTED_CLAIM: Record<ReportOutcome, { code: string; label: string }> = {
  transparent: { code: "transparent_supported", label: "Listed: transparent supported" },
  address_rejected: { code: "transparent_only", label: "Listed: transparent only" },
  form_accepted: { code: "shielded_ua_accepted", label: "Listed: shielded/UA accepted" },
  ironwood: { code: "lands_in_ironwood", label: "Listed: lands in Ironwood" },
  sapling: { code: "lands_in_sapling", label: "Listed: lands in Sapling" },
  orchard: { code: "lands_in_orchard", label: "Listed: lands in Orchard" },
};

const SOURCE_NAMES: Record<string, string> = { "zechub.wiki": "ZecHub" };

/** "ZecHub" for zechub.wiki, otherwise the source's hostname. */
export function sourceName(url: string | null | undefined): string {
  if (!url) return "unknown source";
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return SOURCE_NAMES[host] ?? host;
  } catch {
    return "unknown source";
  }
}
