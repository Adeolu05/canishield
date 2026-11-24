// Reads ZecHub's custodial-exchanges page into listing claims.
// The mapping is the one documented in the snapshot's "mapping" block:
// transparent words become a transparent claim, "transparent addresses only"
// becomes a unified-address rejection, and "unified withdrawals" becomes
// "form accepted". A shielded z-address with no pool and no unified address
// stays out of the matrix. Nothing here is an on-chain test.
import type { AddressType, ReportOutcome } from "./schema";

/**
 * HTX is the exchange this board already tracks as "huobi": the live-status
 * worker and the service URL use that slug. Keeping it updates the same row
 * instead of adding a second exchange.
 */
const SLUG_ALIAS: Record<string, string> = { htx: "huobi" };

export interface ParsedExchange {
  slug: string;
  name: string;
  website: string;
  supports: string;
  ironwood: string;
  claims: Partial<Record<AddressType, ReportOutcome>>;
}

/** CanIShield's reading of one ZecHub "Supports" / "Ironwood" pair. */
export function claimsFromListing(supports: string, ironwood: string): Partial<Record<AddressType, ReportOutcome>> {
  const claims: Partial<Record<AddressType, ReportOutcome>> = {};
  if (/transparent/i.test(supports)) claims.transparent = "transparent";
  if (ironwood === "Not applicable, transparent addresses only") {
    claims.ironwood_ua = "address_rejected";
    claims.full_ua = "address_rejected";
  } else if (/unified withdrawals/i.test(supports)) {
    claims.ironwood_ua = "form_accepted";
    claims.full_ua = "form_accepted";
  }
  return claims;
}

const displayName = (linkText: string) => linkText.replace(/\s*\(formerly[^)]*\)/i, "").trim();

function slugFor(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return SLUG_ALIAS[slug] ?? slug;
}

/**
 * One exchange per heading. Website, Supports and Ironwood are copied from
 * the page (trimmed). A heading that never gets all three fields throws,
 * so a changed page fails the refresh instead of dropping a row.
 */
export function parseZecHubMarkdown(md: string): ParsedExchange[] {
  const exchanges: ParsedExchange[] = [];
  let name: string | null = null;
  let website: string | null = null;
  let supports: string | null = null;
  let ironwood: string | null = null;

  const flush = () => {
    if (!name) return;
    if (!website || supports == null || ironwood == null) {
      throw new Error(`Incomplete ZecHub entry for ${name}.`);
    }
    const shown = displayName(name);
    const supportText = supports.trim();
    const ironwoodText = ironwood.trim();
    exchanges.push({
      slug: slugFor(shown),
      name: shown,
      website,
      supports: supportText,
      ironwood: ironwoodText,
      claims: claimsFromListing(supportText, ironwoodText),
    });
    name = null;
    website = null;
    supports = null;
    ironwood = null;
  };

  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^#{2,3}\s+\[([^\]]+)\]\(/.exec(line);
    if (heading) {
      flush();
      name = heading[1] ?? null;
      continue;
    }
    if (!name) continue;
    const web = /^- Website: \[[^\]]*\]\(([^)]+)\)/.exec(line);
    if (web) website = web[1] ?? null;
    const sup = /^- Supports: (.*)$/.exec(line);
    if (sup) supports = sup[1] ?? "";
    const iron = /^- Ironwood: (.*)$/.exec(line);
    if (iron) ironwood = iron[1] ?? "";
    if (line === "___") flush();
  }
  flush();
  if (!exchanges.length) throw new Error("No exchanges found in the ZecHub page.");
  return exchanges;
}
