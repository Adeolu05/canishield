// Listing snapshots (data/*.json): an existing list's claims, read on a date.
import { addressType, reportOutcome, type AddressType, type ReportOutcome } from "./schema";

export interface Snapshot {
  format: "zecproof-listing-snapshot/1";
  source: { name: string; url: string; file: string; commit: string; readAt: string; license: string; attribution: string };
  exchanges: {
    slug: string;
    name: string;
    website: string;
    supports: string;
    ironwood: string;
    claims: Partial<Record<AddressType, ReportOutcome>>;
  }[];
}

export function parseSnapshot(json: unknown): Snapshot {
  const s = json as Snapshot;
  if (s?.format !== "zecproof-listing-snapshot/1") throw new Error("Not a listing snapshot.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.source?.readAt ?? "")) throw new Error("source.readAt must be YYYY-MM-DD.");
  if (!s.source.url?.startsWith("https://")) throw new Error("source.url must be https.");
  for (const e of s.exchanges) {
    if (!/^[a-z0-9-]+$/.test(e.slug)) throw new Error(`Bad slug "${e.slug}".`);
    for (const [type, outcome] of Object.entries(e.claims)) {
      if (!(addressType.enumValues as readonly string[]).includes(type)) throw new Error(`${e.slug}: bad address type ${type}`);
      if (!(reportOutcome.enumValues as readonly string[]).includes(outcome)) throw new Error(`${e.slug}: bad outcome ${outcome}`);
    }
  }
  return s;
}

/** The note shown with each claim: ZecHub's own words, plus where and when they were read. */
export const listingNote = (s: Snapshot, e: Snapshot["exchanges"][number]) =>
  `ZecHub lists it. Supports: "${e.supports}". Ironwood: "${e.ironwood}". (Read ${s.source.readAt}; source commit ${s.source.commit.slice(0, 10)}; ${s.source.license}.)`;
