// Plain sentences for the board and service pages. Evidence rules stay in
// ./evidence. This file only chooses words, and it never calls a listing a test.
import type { AddressType, Report, ResearchClaimRow } from "@zecproof/db";
import type { Readiness } from "./evidence";
import { shortDate } from "./present";
import { RESEARCH_CLAIM, researchSource, resolutionFor } from "./research";

export type ZecHubListing = "unified" | "z-address" | "transparent_only" | null;

export interface ListingCell {
  outcome: string;
  addressType: string | null;
  note: string | null;
}

/** How a ZecHub listing reads, from the imported cells and the quoted note. */
export function zecHubListing(listings: ListingCell[]): ZecHubListing {
  if (listings.some((r) => (r.addressType === "ironwood_ua" || r.addressType === "full_ua") && r.outcome === "form_accepted")) {
    return "unified";
  }
  const notes = listings.map((r) => r.note ?? "").join("\n");
  if (/shielded/i.test(notes) && !/not applicable, transparent addresses only/i.test(notes)) return "z-address";
  if (listings.length) return "transparent_only";
  return null;
}

/** The import writes this note. It is not our own check, so the status line replaces it. */
export const isAutoListingNote = (notes: string | null | undefined) => !!notes && notes.startsWith("Listed on ");

/** One sentence for a service's research claims. Null when there are none. */
export function describeResearch(claims: Pick<ResearchClaimRow, "claim" | "source" | "serviceId" | "readAt">[], reports: Report[]): string | null {
  const first = claims[0];
  if (!first) return null;
  const src = researchSource(first.source).name;
  const named = `${src.charAt(0).toUpperCase()}${src.slice(1)}`;
  const phrase = resolutionFor(first, reports) ? "a listing dispute was later resolved" : RESEARCH_CLAIM[first.claim].phrase;
  const extra = claims.length > 1 ? ` It also has ${claims.length - 1} more research claim${claims.length > 2 ? "s" : ""}.` : "";
  return `${named} says ${phrase}.${extra}`;
}

export function latestDate(dates: (Date | null | undefined)[]): Date | null {
  let best: Date | null = null;
  for (const d of dates) {
    if (!d) continue;
    if (!best || d.getTime() > best.getTime()) best = d;
  }
  return best;
}

/**
 * Form checks logged on the same day share one timestamp. A refusal of a
 * shielded address answers the site's question, so it wins a tie. A later
 * date still wins outright.
 */
export function formCheckTie(addressType: AddressType | null, outcome: string): number {
  if (outcome === "address_rejected" && addressType === "ironwood_ua") return 4;
  if (outcome === "address_rejected" && addressType === "full_ua") return 3;
  if (outcome === "address_rejected") return 1;
  return 0;
}

export interface DatedPiece {
  at: Date;
  tie: number;
  serviceName: string;
}

export function pickLatest<T extends DatedPiece>(items: T[]): T | null {
  let best: T | null = null;
  for (const item of items) {
    if (!best) {
      best = item;
      continue;
    }
    const dt = item.at.getTime() - best.at.getTime();
    if (dt > 0 || (dt === 0 && (item.tie > best.tie || (item.tie === best.tie && item.serviceName.localeCompare(best.serviceName) < 0)))) {
      best = item;
    }
  }
  return best;
}

export type EvidenceKind = "onchain" | "form_check" | "community" | "deposit" | "exit";

export const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  onchain: "On-chain proof",
  form_check: "Form check",
  community: "Community report",
  deposit: "Deposit check",
  exit: "Exit report",
};

export interface WhereService {
  name: string;
  slug: string;
  readiness: Readiness;
  zecHub: ZecHubListing;
  listingReadAt: Date | null;
}

export interface WhereAnswer {
  verified: { name: string; slug: string; current: boolean }[];
  listed: { name: string; slug: string; kind: "unified" | "z-address"; readAt: Date | null }[];
}

/** Verified shielded withdrawals, and ZecHub listings we have not tested. Never mixed. */
export function whereToShield(services: WhereService[]): WhereAnswer {
  const verified = services
    .filter((s) => s.readiness === "ironwood" || s.readiness === "shielded_other")
    .map((s) => ({ name: s.name, slug: s.slug, current: s.readiness === "ironwood" }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const listed = services
    .filter((s) => s.readiness === "untested" && (s.zecHub === "unified" || s.zecHub === "z-address"))
    .map((s) => ({ name: s.name, slug: s.slug, kind: s.zecHub as "unified" | "z-address", readAt: s.listingReadAt }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { verified, listed };
}

/** One short line for the homepage. The counts come from the answer, never a fixed number. */
export function whereLead(answer: WhereAnswer): string {
  const proven =
    answer.verified.length === 0
      ? "No exchange is proven to send shielded ZEC yet."
      : answer.verified.length === 1
        ? `${answer.verified[0]?.name ?? "One service"} is proven on-chain to send shielded ZEC${answer.verified[0]?.current ? "" : ", in an older pool"}.`
        : `${answer.verified.length} services are proven on-chain to send shielded ZEC.`;
  if (answer.listed.length === 0) return proven;
  const say = answer.listed.length === 1 ? "says it does" : "say they do";
  return `${proven} ZecHub lists ${answer.listed.length} that ${say}.`;
}

export interface StatusInput {
  readiness: Readiness;
  ownCheckedAt: Date | null;
  listingReadAt: Date | null;
  researchReadAt: Date | null;
  zecHub: ZecHubListing;
  /** A full sentence, used only when we have no ZecHub listing. Null if there is no research. */
  researchSentence: string | null;
  now?: Date;
}

export interface ServiceStatus {
  line: string;
  checked: string;
}

const FALLBACK = "Withdraw to a transparent address, then shield the coins in a wallet like Zodl or Zingo.";

function untestedLine(zecHub: ZecHubListing, researchSentence: string | null): string {
  switch (zecHub) {
    case "unified":
      return "Not tested by CanIShield. ZecHub lists shielded or unified withdrawals as accepted, and that claim is unchecked here.";
    case "z-address":
      return "Not tested by CanIShield. ZecHub lists shielded z-address deposits and withdrawals. The pool is not stated, and we have not checked it.";
    case "transparent_only":
      return "Not tested by CanIShield. ZecHub lists transparent addresses only.";
    case null:
      return researchSentence ? `Not tested by CanIShield. ${researchSentence} That is someone else's claim.` : "Not checked yet.";
    default: {
      const neverListing: never = zecHub;
      return neverListing;
    }
  }
}

export function plainStatus(input: StatusInput): ServiceStatus {
  const now = input.now ?? new Date();
  const line = statusLine(input.readiness, input.zecHub, input.researchSentence);
  const checked = checkedLine(input.ownCheckedAt, input.listingReadAt, input.researchReadAt, now);
  return { line, checked };
}

function statusLine(readiness: Readiness, zecHub: ZecHubListing, researchSentence: string | null): string {
  switch (readiness) {
    case "ironwood":
      return "Shielded withdrawals are verified on-chain. You can withdraw straight to a shielded wallet.";
    case "shielded_other":
      return "A shielded withdrawal was verified on-chain, but it landed in an older pool, not the current one.";
    case "transparent_only":
      return `Withdrawals here are transparent, not shielded. ${FALLBACK}`;
    case "rejected":
      return `Shielded addresses are refused. This is a form check, not an on-chain proof. ${FALLBACK}`;
    case "untested":
      return untestedLine(zecHub, researchSentence);
    default: {
      const neverReadiness: never = readiness;
      return neverReadiness;
    }
  }
}

export function checkedLine(own: Date | null, listing: Date | null, research: Date | null, now = new Date()): string {
  if (own) return `Last checked ${shortDate(own, now)}.`;
  if (listing) return `Not checked by CanIShield. Listing read ${shortDate(listing, now)}.`;
  if (research) return `Not checked by CanIShield. Research read ${shortDate(research, now)}.`;
  return "Not checked by CanIShield.";
}
