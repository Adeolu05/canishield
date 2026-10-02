// Community research stays a separate, credited source: never a test result,
// never a listing, never merged with either.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Report, ResearchClaimRow, Service } from "@zecproof/db";
import { LISTED_CLAIM, readinessOf, summarize } from "./evidence";
import { verdictFor } from "./present";
import { RESEARCH_CLAIM, inactiveLast, researchJson } from "./research";

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

test("services that dropped ZEC sort last, others keep their order", () => {
  const rows = [
    { name: "KuCoin", inactive: true },
    { name: "Binance", inactive: false },
    { name: "YWallet", inactive: true },
    { name: "Zodl", inactive: false },
  ];
  assert.deepEqual(inactiveLast(rows).map((r) => r.name), ["Binance", "Zodl", "KuCoin", "YWallet"]);
});
