import { test } from "node:test";
import assert from "node:assert/strict";
import { identifyingContent, mondayOf, parseOutcome } from "./outcome";

const TODAY = new Date("2026-11-13T12:00:00Z"); // a Friday
const SERVICE = "0b6c1f3e-2a4d-4e8b-9c1a-5d6e7f8a9b0c";

const form = (over: Record<string, string | undefined> = {}) => {
  const base: Record<string, string | undefined> = {
    serviceId: SERVICE,
    result: "credited",
    amountBand: "1_to_10",
    route: "direct_shielded",
    sentOn: "2026-11-11",
    own: "yes",
  };
  const f = { ...base, ...over };
  return (name: string) => f[name];
};

test("mondayOf: rounds any day to the Monday of its week (UTC)", () => {
  assert.equal(mondayOf("2026-11-13"), "2026-11-09"); // Friday
  assert.equal(mondayOf("2026-11-09"), "2026-11-09"); // Monday stays
  assert.equal(mondayOf("2026-11-15"), "2026-11-09"); // Sunday belongs to the week before
  assert.equal(mondayOf("2026-01-01"), "2025-12-29"); // across a year
  assert.equal(mondayOf("2024-05-15"), "2024-05-13");
  assert.equal(mondayOf("2026-07-20"), "2026-07-20");
  assert.equal(mondayOf("2026-09-19"), "2026-09-14");
  assert.equal(mondayOf("2026-02-30"), null);
  assert.equal(mondayOf("13/11/2026"), null);
  assert.equal(mondayOf(""), null);
});

test("parseOutcome: keeps only the week, never the day", () => {
  const r = parseOutcome(form(), TODAY);
  assert.ok(r.ok);
  assert.equal(r.value.weekOf, "2026-11-09");
  assert.equal(r.value.daysHeld, null);
  assert.equal(r.value.creditMinutes, null);
  assert.equal(r.value.note, null);
  assert.ok(!("sentOn" in r.value), "the exact date is not passed on");
});

test("parseOutcome: credit time is optional and rounded to 5 minutes", () => {
  const r = parseOutcome(form({ creditMinutes: "12" }), TODAY);
  assert.ok(r.ok);
  assert.equal(r.value.creditMinutes, 10);
  const r2 = parseOutcome(form({ creditMinutes: "13" }), TODAY);
  assert.ok(r2.ok);
  assert.equal(r2.value.creditMinutes, 15);
  assert.equal(parseOutcome(form({ creditMinutes: "-4" }), TODAY).ok, false);
  assert.equal(parseOutcome(form({ creditMinutes: "1.5" }), TODAY).ok, false);
  assert.equal(parseOutcome(form({ creditMinutes: "99999" }), TODAY).ok, false);
  // Ignored for results other than "credited".
  const r3 = parseOutcome(form({ result: "refunded", creditMinutes: "10" }), TODAY);
  assert.ok(r3.ok);
  assert.equal(r3.value.creditMinutes, null);
});

test("parseOutcome: held results need days held, within the time since sending", () => {
  assert.equal(parseOutcome(form({ result: "held_open" }), TODAY).ok, false);
  const ok = parseOutcome(form({ result: "held_open", sentOn: "2026-10-01", daysHeld: "40" }), TODAY);
  assert.ok(ok.ok);
  assert.equal(ok.value.daysHeld, 40);
  const tooLong = parseOutcome(form({ result: "held_then_credited", sentOn: "2026-11-02", daysHeld: "30" }), TODAY);
  assert.equal(tooLong.ok, false);
  // Not kept for other results.
  const credited = parseOutcome(form({ daysHeld: "5" }), TODAY);
  assert.ok(credited.ok);
  assert.equal(credited.value.daysHeld, null);
});

test("parseOutcome: refuses bad choices, future dates and a missing confirmation", () => {
  const r = parseOutcome(
    form({ serviceId: "x", result: "stolen", amountBand: "5", route: "teleport", sentOn: "2026-11-20", own: undefined }),
    TODAY,
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors.length, 6);
  assert.equal(parseOutcome(form({ sentOn: "2016-01-01" }), TODAY).ok, false);
  const noRoute = parseOutcome(form({ route: "" }), TODAY);
  assert.ok(noRoute.ok);
  assert.equal(noRoute.value.route, "unknown");
});

test("parseOutcome: notes can't carry anything that points to a transaction or a person", () => {
  const txid = "7ad4766e568bdd72bf9c38ea07bdbbcad7cfc0d64b31ab4f3e8fdce1472b3d22";
  for (const note of [
    `txid ${txid}`,
    "sent to t1PKBiv7mtzD9bNafYaqyxaENeiNDbpKxxQ please",
    "my u1a5qtpxl7fl6cz6nrmcpnhpa2kgmxyreat94j7a0vsmxyf3gguflq48rk address",
    "from 0x22E62aeD6696a1f089e98e63A35b63d6fDC2f287",
    "mail me at someone@example.com",
    "see https://example.com/ticket",
  ]) {
    assert.ok(identifyingContent(note), note);
    assert.equal(parseOutcome(form({ note }), TODAY).ok, false, note);
  }
  const fine = parseOutcome(form({ note: "Support asked where the ZEC came from.\nCredited the next day." }), TODAY);
  assert.ok(fine.ok);
  assert.equal(fine.value.note, "Support asked where the ZEC came from. Credited the next day.");
  assert.equal(parseOutcome(form({ note: "x".repeat(281) }), TODAY).ok, false);
});

test("parseOutcome: the screenshot link must be https", () => {
  assert.equal(parseOutcome(form({ evidenceUrl: "http://imgur.com/a" }), TODAY).ok, false);
  assert.equal(parseOutcome(form({ evidenceUrl: "javascript:alert(1)" }), TODAY).ok, false);
  assert.equal(parseOutcome(form({ evidenceUrl: "https://user:pw@imgur.com/a" }), TODAY).ok, false);
  const r = parseOutcome(form({ evidenceUrl: "https://imgur.com/a/abc" }), TODAY);
  assert.ok(r.ok);
  assert.equal(r.value.evidenceUrl, "https://imgur.com/a/abc");
});
