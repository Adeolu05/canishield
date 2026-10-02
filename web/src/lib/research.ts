// Community research: product-level claims read from official pages by a
// contributor (docs/research/, imported by `npm run import:research`).
// A third kind of evidence, kept apart from tests, community reports and
// listings: it never fills a matrix cell, never moves readiness, and is
// exported under its own field with its own codes.
import type { ResearchClaim, ResearchClaimRow } from "@zecproof/db";
import { isStale } from "./evidence";

export interface ResearchSource {
  /** How a claim is attributed inline: "per community research (orb)". */
  name: string;
  /** The credit line, confirmed by the contributor. */
  credit: string;
  url: string;
  secondary?: { label: string; url: string };
}

export const RESEARCH_SOURCES: Record<string, ResearchSource> = {
  orb: {
    name: "community research (orb)",
    credit: "Community research by orb",
    url: "https://x.com/ArtofOrb",
    secondary: { label: "zec-os.com", url: "https://zec-os.com" },
  },
};

export const researchSource = (key: string): ResearchSource =>
  RESEARCH_SOURCES[key] ?? { name: `community research (${key})`, credit: `Community research by ${key}`, url: "" };

/**
 * `label` is shown as is; `phrase` completes "<source> says …" in a verdict.
 * `inactive` claims (the product dropped ZEC) sort last on the board.
 */
export const RESEARCH_CLAIM: Record<ResearchClaim, { label: string; phrase: string; inactive?: boolean }> = {
  ironwood_supported: { label: "Claimed: Ironwood supported", phrase: "Ironwood is supported" },
  shielded_supported: { label: "Claimed: shielded supported, Ironwood not stated", phrase: "shielded is supported, Ironwood not stated" },
  transparent_only: { label: "Claimed: transparent only", phrase: "it is transparent only" },
  shielded_not_claimed: { label: "Claimed: ZEC supported, shielded not stated", phrase: "ZEC is supported but shielded is not stated" },
  shielded_announced: { label: "Claimed: shielded support announced, not yet shipped", phrase: "shielded support is announced, not yet shipped" },
  no_longer_supported: { label: "No longer supports ZEC", phrase: "it no longer supports ZEC", inactive: true },
  no_current_release: { label: "No current Zcash release found", phrase: "no current Zcash release was found", inactive: true },
  listing_disputed: { label: "Listing status disputed: check pending", phrase: "its listing status is disputed, check pending" },
};

export const isInactive = (claims: Pick<ResearchClaimRow, "claim">[]) => claims.some((c) => RESEARCH_CLAIM[c.claim].inactive);

/** "Claimed: Ironwood supported · per community research (orb)". */
export const researchLine = (r: Pick<ResearchClaimRow, "claim" | "source">) =>
  `${RESEARCH_CLAIM[r.claim].label} · per ${researchSource(r.source).name}`;

/** One claim line on the board: a listing or a research claim, always with its source. */
export interface ClaimLine {
  kind: "listing" | "research";
  label: string;
  source: string;
  title: string;
  inactive: boolean;
}

/** Stable sort: services whose research says they dropped ZEC go last. */
export const inactiveLast = <T extends { inactive: boolean }>(rows: T[]) =>
  rows.map((r, i) => [r, i] as const).sort(([a, i], [b, j]) => Number(a.inactive) - Number(b.inactive) || i - j).map(([r]) => r);

/** Export shape. Carries `researchClaim`, never `outcome` or `listedClaim`. */
export function researchJson(r: ResearchClaimRow, slug: string, now: Date) {
  const src = researchSource(r.source);
  return {
    id: r.id,
    service: slug,
    source: r.source,
    sourceName: src.name,
    credit: { text: src.credit, url: src.url, secondaryUrl: src.secondary?.url ?? null },
    researchClaim: r.claim,
    researchClaimLabel: RESEARCH_CLAIM[r.claim].label,
    product: r.product,
    detail: r.detail,
    officialUrl: r.officialUrl,
    readAt: r.readAt.toISOString(),
    stale: isStale(r.readAt, now),
    sourceFile: r.sourceFile,
  };
}
