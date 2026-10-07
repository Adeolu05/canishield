// Community research stays a separate, credited source: never a test result,
// never a listing, never merged with either.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Report, ResearchClaimRow, Service } from "@zecproof/db";
import { LISTED_CLAIM, readinessOf, summarize } from "./evidence";
import { verdictFor } from "./present";
import { RESEARCH_CLAIM, inactiveLast, researchJson, researchLabel, resolutionFor } from "./research";

const NOW = new Date("2026-10-02T12:00:00Z");
const svc = (id: string): Service => ({ id, slug: id, name: id, kind: "exchange", websiteUrl: null, notes: null, networks: ["mainnet"], createdAt: NOW, updatedAt: NOW });
const research = (o: Partial<ResearchClaimRow>): ResearchClaimRow =>
  ({
    id: "r1",
    serviceId: "kucoin",
    network: "mainnet",
    source: "orb",
    claim: "no_longer_supported",
    product: "KuCoin",
    detail: "ZEC delisted Sep. 3, 2025; withdrawals closed Oct. 3, 2025",
    officialUrl: "https://www.kucoin.com/announcement",
    readAt: new Date("2026-10-02T00:00:00Z"),
    sourceFile: "docs/research/orb-zec-research-2026-10-02-v2.md",
    createdAt: NOW,
    updatedAt: NOW,
    ...o,
  }) as ResearchClaimRow;
const zechub = { id: "l1", serviceId: "kucoin", network: "mainnet", tier: "listing", status: "accepted", outcome: "address_rejected", addressType: "ironwood_ua", sourceUrl: "https://zechub.wiki/using-zcash/custodial-exchanges", sourceReadAt: new Date("2026-10-02T00:00:00Z"), createdAt: NOW, updatedAt: NOW } as Report;

test("research labels never read as listings or test results", () => {
  const listed = new Set(Object.values(LISTED_CLAIM).map((c) => c.label));
  for (const [code, c] of Object.entries(RESEARCH_CLAIM)) {
    assert.ok(!c.label.startsWith("Listed:"), code);
    assert.ok(!listed.has(c.label), code);
    assert.ok(c.label.startsWith("Claimed:") || c.inactive || code === "listing_disputed", `${code} must say it is a claim`);
  }
  assert.equal(RESEARCH_CLAIM.listing_disputed.label, "Listing status disputed: check pending");
  assert.equal(RESEARCH_CLAIM.no_longer_supported.label, "No longer supports ZEC");
});

test("research never moves readiness or fills a matrix cell", () => {
  // summarize and readinessOf take no research at all: the separation is in the types.
  assert.equal(readinessOf([], [zechub]), "untested");
  const { rows } = summarize([svc("kucoin")], [], [zechub], NOW);
  assert.equal(rows[0].readiness, "untested");
  assert.equal(rows[0].cells.ironwood_ua.tier, "listing", "the ZecHub listing keeps its own cell");
});

test("where ZecHub and orb disagree, the verdict shows both, each with its source", () => {
  const v = verdictFor("untested", [], [zechub], NOW, [research({})]);
  assert.equal(v.title, "Not tested yet");
  assert.match(v.detail, /ZecHub lists it as transparent only/);
  assert.match(v.detail, /community research \(orb\) says it no longer supports ZEC/);
  assert.match(v.detail, /all unverified/);
});

test("export carries researchClaim and credit, never outcome or listedClaim", () => {
  const j = researchJson(research({}), "kucoin", NOW);
  assert.equal(j.researchClaim, "no_longer_supported");
  assert.equal(j.credit.text, "Community research by orb");
  assert.equal(j.credit.url, "https://x.com/ArtofOrb");
  assert.equal(j.credit.secondaryUrl, "https://zec-os.com");
  assert.ok(!("outcome" in j) && !("listedClaim" in j));
  assert.equal(j.readAt, "2026-10-02T00:00:00.000Z");
});

test("a disputed listing is resolved only by a later form check the form accepted", () => {
  const disputed = research({ serviceId: "bitget", claim: "listing_disputed", product: "Bitget" });
  const check = (o: Partial<Report>) =>
    ({ id: "fc", serviceId: "bitget", network: "mainnet", tier: "community", status: "unreviewed", method: "withdrawal_form_check", outcome: "form_accepted", addressType: "transparent", observedAt: new Date("2026-10-05T12:00:00Z"), createdAt: NOW, updatedAt: NOW, ...o }) as Report;
  assert.equal(researchLabel(disputed, []), "Listing status disputed: check pending");
  assert.equal(resolutionFor(disputed, [check({ outcome: "address_rejected" })]), null, "a rejection says nothing about the listing");
  assert.equal(resolutionFor(disputed, [check({ observedAt: new Date("2026-09-30T12:00:00Z") })]), null, "older than the claim");
  assert.equal(resolutionFor(disputed, [check({ status: "rejected" })]), null, "rejected by an admin");
  assert.equal(resolutionFor(disputed, [check({ serviceId: "mexc" })]), null, "another service");
  assert.equal(resolutionFor(disputed, [check({ method: null })]), null, "only form checks resolve it");

  const reports = [check({ outcome: "address_rejected", id: "r1" }), check({})];
  const r = resolutionFor(disputed, reports)!;
  assert.equal(r.reportId, "fc");
  assert.equal(r.date.toISOString(), "2026-10-05T12:00:00.000Z");
  assert.equal(researchLabel(disputed, reports), "Claimed: not listed");

  // The original claim stays as it was, with its date; the resolution sits beside it.
  const j = researchJson(disputed, "bitget", NOW, reports);
  assert.equal(j.researchClaim, "listing_disputed");
  assert.equal(j.readAt, "2026-10-02T00:00:00.000Z");
  assert.deepEqual(j.resolution, { date: "2026-10-05T12:00:00.000Z", text: "ZEC withdrawals available (CanIShield form check)", reportId: "fc" });
  assert.equal(researchJson(disputed, "bitget", NOW, []).resolution, null);

  const v = verdictFor("untested", [], [], NOW, [disputed]);
  assert.match(v.detail, /disputed/);
  const settled = verdictFor("untested", [], [check({})], NOW, [disputed]);
  assert.doesNotMatch(settled.detail, /disputed/);
  assert.match(settled.detail, /not listed, since resolved: zec withdrawals available/);
});

test("services that dropped ZEC sort last, others keep their order", () => {
  const rows = [
    { name: "KuCoin", inactive: true },
    { name: "Binance", inactive: false },
    { name: "YWallet", inactive: true },
    { name: "Zodl", inactive: false },
  ];
  assert.deepEqual(inactiveLast(rows).map((r) => r.name), ["Binance", "Zodl", "KuCoin", "YWallet"]);
});
