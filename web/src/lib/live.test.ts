import { test } from "node:test";
import assert from "node:assert/strict";
import { LIVE_STALE_MS, ago, atomFeed, creditEstimate, liveJson, liveSentence, presentLive, type LiveRow } from "./live";
import { embedSummary } from "./embed";
import { renderEmbedHtml } from "./embed-html";

const NOW = new Date("2026-11-16T12:00:00Z");
const row = (over: Partial<LiveRow> = {}): LiveRow => ({
  slug: "kraken",
  name: "Kraken",
  source: "Kraken public API",
  deposit: "open",
  withdraw: "paused",
  confirmations: 15,
  note: null,
  checkedAt: new Date(NOW.getTime() - 3 * 60_000),
  lastOkAt: new Date(NOW.getTime() - 3 * 60_000),
  changedAt: null,
  ...over,
});

test("presentLive: fresh readings show; old ones turn unknown", () => {
  const v = presentLive(row(), NOW);
  assert.equal(v.fresh, true);
  assert.deepEqual([v.deposit, v.withdraw], ["open", "paused"]);
  const old = presentLive(row({ checkedAt: new Date(NOW.getTime() - LIVE_STALE_MS - 1000), note: "withdrawals delayed" }), NOW);
  assert.equal(old.fresh, false);
  assert.deepEqual([old.deposit, old.withdraw, old.note], ["unknown", "unknown", null]);
  assert.equal(presentLive(row({ deposit: "weird" }), NOW).deposit, "unknown");
});

test("creditEstimate: confirmations at 25 s blocks", () => {
  assert.equal(creditEstimate(null), null);
  assert.equal(creditEstimate(1), "about 1 min");
  assert.equal(creditEstimate(10), "about 4 min");
  assert.equal(creditEstimate(15), "about 6 min");
  assert.equal(creditEstimate(400), "about 3 h");
});

test("ago and liveSentence", () => {
  assert.equal(ago(new Date(NOW.getTime() - 20_000), NOW), "just now");
  assert.equal(ago(new Date(NOW.getTime() - 4 * 60_000), NOW), "4 min ago");
  assert.equal(ago(new Date(NOW.getTime() - 3 * 3600_000), NOW), "3 h ago");
  assert.equal(liveSentence(presentLive(row(), NOW)), "ZEC deposits open, withdrawals paused.");
  assert.equal(liveSentence(presentLive(row({ withdraw: "open" }), NOW)), "ZEC deposits and withdrawals open.");
  assert.equal(liveSentence(presentLive(row({ deposit: "unknown", withdraw: "unknown" }), NOW)), null);
});

test("liveJson says what it means", () => {
  const j = liveJson(presentLive(row(), NOW));
  assert.equal(j.deposits, "open");
  assert.equal(j.withdrawals, "paused");
  assert.match(j.meaning, /Not about shielded support/);
});

test("atomFeed: valid shape, everything escaped, newest updated", () => {
  const xml = atomFeed(
    [
      { slug: "kraken", name: "Kraken", side: "withdraw", fromState: "open", toState: "paused", at: new Date("2026-11-16T11:00:00Z") },
      { slug: "x", name: `<b>&"Evil'`, side: "deposit", fromState: "paused", toState: "open", at: new Date("2026-11-15T11:00:00Z") },
    ],
    "https://canishield.vercel.app",
    NOW,
  );
  assert.match(xml, /^<\?xml version="1.0" encoding="utf-8"\?>\n<feed xmlns="http:\/\/www.w3.org\/2005\/Atom">/);
  assert.match(xml, /<updated>2026-11-16T11:00:00.000Z<\/updated><link rel="alternate"/);
  assert.match(xml, /<title>Kraken: ZEC withdrawals paused<\/title>/);
  assert.doesNotMatch(xml, /<b>&"Evil'/);
  assert.match(xml, /&lt;b&gt;&amp;&quot;Evil&apos;: ZEC deposits reopened/);
  assert.equal((xml.match(/<entry>/g) ?? []).length, 2);
  assert.match(atomFeed([], "https://canishield.vercel.app", NOW), /<updated>2026-11-16T12:00:00.000Z<\/updated>/);
});

test("embed card: a live row when fresh, and still at most three rows", () => {
  const service = { id: "0b6c1f3e-2a4d-4e8b-9c1a-5d6e7f8a9b0c", slug: "kraken", name: "Kraken" };
  const base = embedSummary({ service, deposits: [], outcomes: [], siteUrl: "https://canishield.vercel.app", reportOpen: false });
  const text = (html: string) => html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<[^>]+>/g, "");
  const withLive = renderEmbedHtml({ ...base, live: liveJson(presentLive(row(), NOW)) }, { theme: "auto", now: NOW });
  assert.match(text(withLive), /Right now: ZEC deposits open, withdrawals paused \(Kraken public API; not about shielded support\)/);
  assert.equal((withLive.match(/<li>/g) ?? []).length, 3);
  assert.match(withLive, /class="ic t-bad"/, "a pause is shown in the bad tone");
  const stale = renderEmbedHtml({ ...base, live: liveJson(presentLive(row({ checkedAt: new Date(0) }), NOW)) }, { theme: "auto", now: NOW });
  assert.doesNotMatch(text(stale), /Right now/);
  const none = renderEmbedHtml({ ...base, live: null }, { theme: "auto", now: NOW });
  assert.match(text(none), /Send a small test amount first/);
});
