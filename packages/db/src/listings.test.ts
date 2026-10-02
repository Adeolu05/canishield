import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { listingNote, parseSnapshot } from "./listings";

const snap = parseSnapshot(JSON.parse(readFileSync(new URL("../data/zechub-custodial-exchanges.json", import.meta.url), "utf8")));

test("ZecHub snapshot records its source, read date and license", () => {
  assert.equal(snap.source.url, "https://zechub.wiki/using-zcash/custodial-exchanges");
  assert.match(snap.source.file, new RegExp(snap.source.commit));
  assert.equal(snap.source.readAt, "2026-10-02");
  assert.equal(snap.source.license, "CC BY-SA 4.0");
  assert.equal(snap.exchanges.length, 11);
});

test("claims follow ZecHub's own words", () => {
  for (const e of snap.exchanges) {
    const transparentOnly = e.ironwood === "Not applicable, transparent addresses only";
    if (transparentOnly) {
      assert.deepEqual(e.claims, { transparent: "transparent", ironwood_ua: "address_rejected", full_ua: "address_rejected" }, e.slug);
    }
    if (/unified withdrawals/i.test(e.supports)) {
      assert.equal(e.claims.full_ua, "form_accepted", e.slug);
    }
    if (!/transparent/i.test(e.supports)) assert.equal(e.claims.transparent, undefined, e.slug);
    if (e.ironwood === "Not stated" && !/unified/i.test(e.supports)) {
      assert.equal(e.claims.ironwood_ua, undefined, e.slug);
      assert.equal(e.claims.full_ua, undefined, e.slug);
    }
  }
});

test("each note quotes ZecHub verbatim with the read date", () => {
  const gemini = snap.exchanges.find((e) => e.slug === "gemini")!;
  const note = listingNote(snap, gemini);
  assert.ok(note.includes(`"${gemini.supports}"`));
  assert.ok(note.includes("Read 2026-10-02"));
  assert.ok(note.includes("CC BY-SA 4.0"));
});
