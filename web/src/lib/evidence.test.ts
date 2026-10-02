import { test } from "node:test";
import assert from "node:assert/strict";
import type { Report, Service, Test } from "@zecproof/db";
import { bestCell, isStale, readinessOf, summarize } from "./evidence";

const NOW = new Date("2026-10-02T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const svc = (id: string): Service => ({ id, slug: id, name: id, kind: "wallet", websiteUrl: null, notes: null, networks: ["mainnet"], createdAt: NOW, updatedAt: NOW });
const tst = (o: Partial<Test>): Test => ({ id: Math.random().toString(), serviceId: "s", network: "mainnet", status: "received", addressType: "transparent", receivedPool: "transparent", receivedAt: daysAgo(1), updatedAt: NOW, createdAt: NOW, ...o }) as Test;
const rep = (o: Partial<Report>): Report => ({ id: Math.random().toString(), serviceId: "s", network: "mainnet", tier: "community", status: "unreviewed", outcome: "address_rejected", addressType: "ironwood_ua", createdAt: daysAgo(1), updatedAt: NOW, sourceReadAt: null, ...o }) as Report;

test("stale after 30 days, not at 30", () => {
  assert.equal(isStale(daysAgo(30), NOW), false);
  assert.equal(isStale(daysAgo(31), NOW), true);
});

test("cell ranks verified > community > listing and dates listings by read date", () => {
  const listing = rep({ tier: "listing", status: "accepted", outcome: "transparent", addressType: "transparent", createdAt: daysAgo(0), sourceReadAt: daysAgo(40) });
  const c = bestCell([], [listing], "transparent", NOW);
  assert.equal(c.tier, "listing");
  assert.ok("stale" in c && c.stale, "listing read 40 days ago is stale");
  const v = bestCell([tst({ receivedAt: daysAgo(2) })], [listing, rep({ addressType: "transparent" })], "transparent", NOW);
  assert.equal(v.tier, "verified");
  assert.ok("stale" in v && !v.stale);
  const newer = bestCell([tst({ receivedAt: daysAgo(50) }), tst({ receivedAt: daysAgo(3) })], [], "transparent", NOW);
  assert.ok(newer.tier === "verified" && !newer.stale, "newest verified test wins");
});

test("readiness buckets", () => {
  // Trust Wallet today: both UAs rejected, transparent verified.
  const trust = [rep({ addressType: "ironwood_ua" }), rep({ addressType: "full_ua" })];
  assert.equal(readinessOf([tst({})], trust), "transparent_only");
  assert.equal(readinessOf([], trust), "rejected");
  assert.equal(readinessOf([tst({ addressType: "full_ua", receivedPool: "ironwood" })], trust), "ironwood");
  assert.equal(readinessOf([tst({ addressType: "full_ua", receivedPool: "transparent" })], []), "transparent_only");
  assert.equal(readinessOf([tst({})], []), "untested", "transparent works, shielded never tried");
  const listingOnly = [rep({ tier: "listing", status: "accepted", outcome: "address_rejected" })];
  assert.equal(readinessOf([], listingOnly), "untested", "listings never move a service");
});

test("summary counts every service exactly once", () => {
  const s = summarize(
    [svc("a"), svc("b"), svc("c")],
    [tst({ serviceId: "a", addressType: "ironwood_ua", receivedPool: "ironwood" })],
    [rep({ serviceId: "c", tier: "listing", status: "accepted", outcome: "transparent", addressType: "transparent", sourceReadAt: daysAgo(1) })],
    NOW,
  );
  assert.equal(s.total, 3);
  assert.equal(s.counts.ironwood, 1);
  assert.equal(s.counts.untested, 2);
  assert.equal(s.untestedWithListing, 1);
});

test("listing claims can never be mistaken for results", async () => {
  const { LISTED_CLAIM, sourceName } = await import("./evidence");
  const { reportOutcome } = await import("@zecproof/db/schema");
  const outcomes = reportOutcome.enumValues as readonly string[];
  const codes = outcomes.map((o) => LISTED_CLAIM[o as keyof typeof LISTED_CLAIM].code);
  assert.equal(new Set(codes).size, codes.length, "codes are unique");
  for (const o of outcomes) {
    const claim = LISTED_CLAIM[o as keyof typeof LISTED_CLAIM];
    assert.match(claim.label, /^Listed: /, o);
    assert.ok(!outcomes.includes(claim.code), `code ${claim.code} must not reuse an outcome value`);
    assert.ok(!/Address rejected|Form accepted/.test(claim.label), "result wording is reserved for tests and reports");
  }
  assert.equal(LISTED_CLAIM.address_rejected.label, "Listed: transparent only");
  assert.equal(LISTED_CLAIM.form_accepted.label, "Listed: shielded/UA accepted");
  assert.equal(sourceName("https://zechub.wiki/using-zcash/custodial-exchanges"), "ZecHub");
  assert.equal(sourceName("https://www.example.org/x"), "example.org");
});
