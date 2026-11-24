import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkedLine,
  formCheckTie,
  isAutoListingNote,
  pickLatest,
  plainStatus,
  whereLead,
  whereToShield,
  zecHubListing,
  type WhereAnswer,
  type WhereService,
} from "./plain";

const NOW = new Date("2026-11-23T12:00:00Z");
const OCT = new Date("2026-10-02T00:00:00Z");
const NOV12 = new Date("2026-11-12T12:00:00Z");
const NOV17 = new Date("2026-11-17T12:00:00Z");

test("ZecHub shielded wording stays a listing, and a z-address is not a unified claim", () => {
  assert.equal(
    zecHubListing([
      { outcome: "form_accepted", addressType: "ironwood_ua", note: 'Supports: "Shielded and unified withdrawals"' },
      { outcome: "transparent", addressType: "transparent", note: "transparent" },
    ]),
    "unified",
  );
  assert.equal(
    zecHubListing([
      {
        outcome: "transparent",
        addressType: "transparent",
        note: 'Supports: "Transparent | Shielded (z-address Deposit & Withdrawal)". Ironwood: "Not stated".',
      },
    ]),
    "z-address",
  );
  assert.equal(
    zecHubListing([
      {
        outcome: "address_rejected",
        addressType: "ironwood_ua",
        note: 'Ironwood: "Not applicable, transparent addresses only".',
      },
    ]),
    "transparent_only",
  );
  assert.equal(zecHubListing([]), null);
});

test("a service we have checked does not keep the automatic not-yet-tested note", () => {
  assert.equal(isAutoListingNote("Listed on ZecHub Wiki (read 2026-10-02). Not yet tested by CanIShield."), true);
  assert.equal(isAutoListingNote("Supports mainnet and testnet."), false);
  assert.equal(isAutoListingNote(null), false);
});

test("where to get shielded ZEC lists only verified payments and untested ZecHub claims", () => {
  const rows: WhereService[] = [
    { name: "Trust Wallet", slug: "trust-wallet", readiness: "transparent_only", zecHub: null, listingReadAt: null },
    { name: "Binance", slug: "binance", readiness: "rejected", zecHub: "unified", listingReadAt: OCT },
    { name: "Gemini", slug: "gemini", readiness: "untested", zecHub: "unified", listingReadAt: OCT },
    { name: "BitcoinVN", slug: "bitcoinvn", readiness: "untested", zecHub: "z-address", listingReadAt: OCT },
    { name: "Kraken", slug: "kraken", readiness: "untested", zecHub: "transparent_only", listingReadAt: OCT },
    { name: "Zingo", slug: "zingo", readiness: "untested", zecHub: null, listingReadAt: null },
  ];
  const where = whereToShield(rows);
  assert.deepEqual(where.verified, []);
  assert.deepEqual(
    where.listed.map((s) => s.slug),
    ["bitcoinvn", "gemini"],
  );
  const withProof = whereToShield([
    { name: "Example", slug: "example", readiness: "ironwood", zecHub: "unified", listingReadAt: OCT },
    ...rows,
  ]);
  assert.deepEqual(withProof.verified, [{ name: "Example", slug: "example", current: true }]);
  assert.ok(!withProof.listed.some((s) => s.slug === "example"));
});

test("the homepage lead is one line and the ZecHub count comes from the data", () => {
  const listed = (n: number): WhereAnswer["listed"] =>
    Array.from({ length: n }, (_, i) => ({ name: `S${i}`, slug: `s${i}`, kind: "unified" as const, readAt: null }));
  const none: WhereAnswer = { verified: [], listed: listed(2) };
  assert.equal(whereLead(none), "No exchange is proven to send shielded ZEC yet. ZecHub lists 2 that say they do.");
  assert.equal(
    whereLead({ verified: [], listed: listed(1) }),
    "No exchange is proven to send shielded ZEC yet. ZecHub lists 1 that says it does.",
  );
  assert.equal(whereLead({ verified: [], listed: [] }), "No exchange is proven to send shielded ZEC yet.");
  assert.doesNotMatch(whereLead({ verified: [], listed: listed(4) }), /lists 2/);
  assert.match(whereLead({ verified: [], listed: listed(4) }), /lists 4 that say they do/);
  const proven = whereLead({
    verified: [{ name: "Example", slug: "example", current: true }],
    listed: listed(2),
  });
  assert.match(proven, /^Example is proven on-chain/);
  assert.doesNotMatch(proven, /No exchange is proven/);
  assert.match(
    whereLead({ verified: [{ name: "Old Pool", slug: "old", current: false }], listed: [] }),
    /older pool/,
  );
});

test("plain status never calls a listing or a form check verified", () => {
  const refused = plainStatus({
    readiness: "rejected",
    ownCheckedAt: NOV17,
    listingReadAt: OCT,
    researchReadAt: OCT,
    zecHub: "transparent_only",
    researchSentence: null,
    now: NOW,
  });
  assert.match(refused.line, /form check, not an on-chain proof/);
  assert.doesNotMatch(refused.line, /Not yet tested|verified/i);
  assert.equal(refused.checked, "Last checked Nov 17.");

  const listed = plainStatus({
    readiness: "untested",
    ownCheckedAt: null,
    listingReadAt: OCT,
    researchReadAt: null,
    zecHub: "unified",
    researchSentence: "Community research (orb) says Ironwood is supported.",
    now: NOW,
  });
  assert.match(listed.line, /ZecHub lists shielded or unified/);
  assert.match(listed.line, /unchecked/);
  assert.doesNotMatch(listed.line, /verified|Community research/i);
  assert.equal(listed.checked, "Not checked by CanIShield. Listing read Oct 2.");

  const zaddr = plainStatus({
    readiness: "untested",
    ownCheckedAt: null,
    listingReadAt: OCT,
    researchReadAt: null,
    zecHub: "z-address",
    researchSentence: null,
    now: NOW,
  });
  assert.match(zaddr.line, /z-address/);
  assert.match(zaddr.line, /not checked/i);

  const none = plainStatus({
    readiness: "untested",
    ownCheckedAt: null,
    listingReadAt: null,
    researchReadAt: null,
    zecHub: null,
    researchSentence: null,
    now: NOW,
  });
  assert.equal(none.line, "Not checked yet.");
  assert.equal(none.checked, "Not checked by CanIShield.");
});

test("last checked uses our own date, not the listing read date", () => {
  assert.equal(checkedLine(NOV12, OCT, OCT, NOW), "Last checked Nov 12.");
  assert.equal(checkedLine(null, null, OCT, NOW), "Not checked by CanIShield. Research read Oct 2.");
});

test("the newest evidence wins, and a same-time shielded refusal beats a transparent form accept", () => {
  const olderProof = { at: new Date("2026-10-02T02:41:20Z"), tie: 0, serviceName: "Trust Wallet", kind: "onchain" };
  const transparentAccept = { at: NOV17, tie: formCheckTie("transparent", "form_accepted"), serviceName: "Binance", kind: "form" };
  const shieldedRefusal = { at: NOV17, tie: formCheckTie("ironwood_ua", "address_rejected"), serviceName: "Gate", kind: "form" };
  const sameTimeOther = { at: NOV17, tie: formCheckTie("ironwood_ua", "address_rejected"), serviceName: "OKX", kind: "form" };
  const picked = pickLatest([olderProof, transparentAccept, sameTimeOther, shieldedRefusal]);
  assert.equal(picked?.serviceName, "Gate");
  assert.equal(formCheckTie("full_ua", "address_rejected") < formCheckTie("ironwood_ua", "address_rejected"), true);
});
