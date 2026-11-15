import { test } from "node:test";
import assert from "node:assert/strict";
import { embedSummary, embedTheme, latestDeposit, type DepositInput } from "./embed";
import { escapeHtml, renderEmbedHtml } from "./embed-html";
import type { OutcomeRow } from "./outcome-record";

const SITE = "https://canishield.vercel.app";
const SERVICE = { id: "0b6c1f3e-2a4d-4e8b-9c1a-5d6e7f8a9b0c", slug: "binance", name: "Binance" };
const NOW = new Date("2026-11-15T09:00:00Z");

const dep = (over: Partial<DepositInput>): DepositInput => ({
  addressType: "tex",
  result: "credited",
  blockTime: new Date("2026-11-07T13:50:00Z"),
  creditedAt: new Date("2026-11-07T14:00:00Z"),
  ...over,
});
let n = 0;
const out = (over: Partial<OutcomeRow>): OutcomeRow => ({
  id: `o${++n}`,
  serviceId: SERVICE.id,
  result: "rejected",
  amountBand: "unknown",
  route: "direct_shielded",
  weekOf: "2026-09-14",
  daysHeld: null,
  creditMinutes: null,
  sourceUrl: "https://forum.zcashcommunity.com/t/x/47667/74",
  note: "A note that must never reach the card.",
  ...over,
});

test("latestDeposit: newest payment with a result wins; unfinished checks are ignored", () => {
  const older = dep({ blockTime: new Date("2026-11-01T00:00:00Z") });
  const newer = dep({ blockTime: new Date("2026-11-07T13:50:00Z") });
  const noResult = dep({ result: null, blockTime: new Date("2026-11-10T00:00:00Z") });
  assert.equal(latestDeposit([older, noResult, newer]), newer);
  assert.equal(latestDeposit([noResult]), undefined);
  assert.equal(latestDeposit([]), undefined);
});

test("embedSummary: matches the service page (Binance as published on 15 Nov 2026)", () => {
  const s = embedSummary({
    service: SERVICE,
    deposits: [dep({})],
    outcomes: [out({}), out({ weekOf: "2024-05-13" })],
    siteUrl: SITE,
    reportOpen: true,
  });
  assert.deepEqual(s.service, { slug: "binance", name: "Binance" });
  assert.equal(s.url, `${SITE}/services/binance`);
  assert.equal(s.reportUrl, `${SITE}/report/outcome?service=${SERVICE.id}`);
  assert.deepEqual(s.deposit, {
    result: "credited",
    label: "Credited",
    addressType: "tex",
    to: "a TEX",
    date: "2026-11-07",
    creditMinutes: 10,
    credit: "about 10 min",
    ok: true,
  });
  assert.equal(s.outcomes.total, 2);
  assert.deepEqual(s.outcomes.counts, { rejected: 2 });
  assert.deepEqual(s.outcomes.latest, { result: "rejected", label: "Refused", weekOf: "2026-09-14", week: "week of 14 Sep 2026" });
  assert.equal(s.outcomes.trouble, 2);
});

test("embedSummary: never carries report details, ids or notes, only counts and the latest result", () => {
  const s = embedSummary({ service: SERVICE, deposits: [], outcomes: [out({})], siteUrl: SITE, reportOpen: false });
  const json = JSON.stringify(s);
  for (const leak of ["must never reach", "47667", "direct_shielded", "o1", "amountBand"]) assert.ok(!json.includes(leak), leak);
  assert.equal(s.deposit, null);
  assert.equal(s.reportUrl, null);
});

test("embedSummary: a deposit that wasn't credited has no credit time", () => {
  const s = embedSummary({ service: SERVICE, deposits: [dep({ result: "held_for_review", creditedAt: null })], outcomes: [], siteUrl: SITE, reportOpen: false });
  assert.equal(s.deposit?.ok, false);
  assert.equal(s.deposit?.credit, null);
  assert.equal(s.deposit?.creditMinutes, null);
  assert.equal(s.outcomes.latest, null);
});

test("embedTheme: only known values, otherwise auto", () => {
  assert.equal(embedTheme("dark"), "dark");
  assert.equal(embedTheme("light"), "light");
  assert.equal(embedTheme("<script>"), "auto");
  assert.equal(embedTheme(null), "auto");
});

test("renderEmbedHtml: the card says what the service page says, with no script", () => {
  const s = embedSummary({ service: SERVICE, deposits: [dep({})], outcomes: [out({}), out({ weekOf: "2024-05-13" })], siteUrl: SITE, reportOpen: true });
  const html = renderEmbedHtml(s, { theme: "auto", now: NOW });
  const text = html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<[^>]+>/g, "");
  assert.match(text, /Our deposit check: Credited, about 10 min \(Nov 7, to a TEX address, checked on-chain\)/);
  assert.match(text, /Latest report: Refused \(week of 14 Sep 2026\)\. 2 reports, 2 with a hold, refusal or refund\./);
  assert.match(text, /Send a small test amount first/);
  assert.doesNotMatch(html, /<script|\son[a-z]+=|javascript:/i);
  assert.match(html, /href="https:\/\/canishield\.vercel\.app\/services\/binance" target="_blank" rel="noopener noreferrer"/);
  assert.match(html, /src="\/service-icons\/binance\.png"/, "same origin as the card, so img-src 'self' allows it");
  assert.match(html, /prefers-color-scheme:dark/);
  assert.doesNotMatch(renderEmbedHtml(s, { theme: "light", now: NOW }), /prefers-color-scheme/);
});

test("renderEmbedHtml: names from the database are escaped", () => {
  const evil = { id: SERVICE.id, slug: "evil", name: `<img src=x onerror=alert(1)>"` };
  const s = embedSummary({ service: evil, deposits: [], outcomes: [], siteUrl: SITE, reportOpen: false });
  const html = renderEmbedHtml(s, { theme: "dark", now: NOW });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;&quot;/);
  assert.match(text(html), /No reports yet of what happened/);
  assert.equal(escapeHtml(`a&<>"'`), "a&amp;&lt;&gt;&quot;&#39;");
});

function text(html: string) {
  return html.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<[^>]+>/g, "");
}
