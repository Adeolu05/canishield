// Live ZEC deposit/withdrawal status, as read by the mainnet worker from
// exchanges' own public APIs (worker/src/status-sources.ts). Pure, so it can be
// unit tested. This is about an exchange taking ZEC at all: it never says
// anything about shielded support, and is never shown as a verdict.

export type LiveState = "open" | "paused" | "unknown";

export interface LiveRow {
  slug: string;
  name: string;
  source: string;
  deposit: string;
  withdraw: string;
  confirmations: number | null;
  note: string | null;
  checkedAt: Date;
  lastOkAt: Date | null;
  changedAt: Date | null;
}

export interface LiveEvent {
  slug: string;
  name: string;
  side: string;
  fromState: string;
  toState: string;
  at: Date;
}

/** The worker asks every 5 minutes; past this the reading is too old to show as "right now". */
export const LIVE_STALE_MS = 20 * 60_000;
/** Zcash's block target since NU7 (block 3,543,405), used for a rough credit estimate. */
export const BLOCK_SECONDS = 25;

export const LIVE_LABEL: Record<LiveState, string> = { open: "Open", paused: "Paused", unknown: "Unknown" };

/** Exchanges on the board that aren't read live, and why. Kept honest: shown on the status page. */
export const NOT_LIVE: Record<string, string> = {
  binance: "Its status feed needs an API key.",
  mexc: "Its status feed needs an API key.",
  okx: "Its status feed needs an API key.",
  coinbase: "Its public feed has no flag for paused deposits or withdrawals.",
  gemini: "No public status feed found.",
  coindcx: "No public status feed found.",
  bitcoinvn: "No public status feed found.",
  robinhood: "No public status feed found.",
};

const asState = (v: string): LiveState => (v === "open" || v === "paused" ? v : "unknown");

export interface LiveView {
  slug: string;
  name: string;
  source: string;
  deposit: LiveState;
  withdraw: LiveState;
  /** The worker read it recently enough to call it "right now". */
  fresh: boolean;
  checkedAt: Date;
  /** "about 4 min" from the exchange's confirmation count at 25 s blocks, when it publishes one. */
  creditEstimate: string | null;
  confirmations: number | null;
  note: string | null;
}

export function creditEstimate(confirmations: number | null): string | null {
  if (confirmations == null) return null;
  const min = Math.max(1, Math.round((confirmations * BLOCK_SECONDS) / 60));
  return min >= 120 ? `about ${Math.round(min / 60)} h` : `about ${min} min`;
}

export function presentLive(row: LiveRow, now: Date): LiveView {
  const fresh = now.getTime() - row.checkedAt.getTime() <= LIVE_STALE_MS;
  return {
    slug: row.slug,
    name: row.name,
    source: row.source,
    deposit: fresh ? asState(row.deposit) : "unknown",
    withdraw: fresh ? asState(row.withdraw) : "unknown",
    fresh,
    checkedAt: row.checkedAt,
    creditEstimate: creditEstimate(row.confirmations),
    confirmations: row.confirmations,
    note: fresh ? row.note : null,
  };
}

/** "just now", "4 min ago", "2 h ago", "3 days ago". */
export function ago(d: Date, now: Date): string {
  const s = Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** One sentence for cards: "ZEC deposits open, withdrawals paused." Null when nothing is known. */
export function liveSentence(v: LiveView): string | null {
  if (!v.fresh || (v.deposit === "unknown" && v.withdraw === "unknown")) return null;
  const word = (s: LiveState) => (s === "unknown" ? "unknown" : s);
  if (v.deposit === v.withdraw) return `ZEC deposits and withdrawals ${word(v.deposit)}.`;
  return `ZEC deposits ${word(v.deposit)}, withdrawals ${word(v.withdraw)}.`;
}

/** The JSON block for /api/services/[slug] and /api/status.json. */
export function liveJson(v: LiveView) {
  return {
    deposits: v.deposit,
    withdrawals: v.withdraw,
    fresh: v.fresh,
    checkedAt: v.checkedAt.toISOString(),
    source: v.source,
    confirmations: v.confirmations,
    note: v.note,
    meaning: "Whether the exchange takes ZEC at all right now, from its own public API. Not about shielded support.",
  };
}

const xml = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export function eventTitle(e: LiveEvent): string {
  const what = e.side === "deposit" ? "deposits" : "withdrawals";
  return `${e.name}: ZEC ${what} ${e.toState === "paused" ? "paused" : "reopened"}`;
}

/** An Atom feed of confirmed open/paused changes, newest first. */
export function atomFeed(events: LiveEvent[], site: string, now: Date): string {
  const updated = (events[0]?.at ?? now).toISOString();
  const entries = events
    .map((e) => {
      const url = `${site}/services/${encodeURIComponent(e.slug)}`;
      const id = `${site}/status#${encodeURIComponent(e.slug)}-${e.side}-${e.at.getTime()}`;
      const body = `${eventTitle(e)} (was ${e.fromState}), seen on ${e.name}'s public API at ${e.at.toISOString().slice(11, 16)} UTC. This is about ZEC in general, not shielded support.`;
      return `<entry><id>${xml(id)}</id><title>${xml(eventTitle(e))}</title><updated>${e.at.toISOString()}</updated><link href="${xml(url)}"/><summary>${xml(body)}</summary></entry>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><id>${xml(`${site}/status`)}</id><title>CanIShield: live ZEC deposit and withdrawal changes</title><updated>${updated}</updated><link rel="alternate" href="${xml(`${site}/status`)}"/><link rel="self" href="${xml(`${site}/status/feed.xml`)}"/><author><name>CanIShield</name></author>${entries}</feed>
`;
}
