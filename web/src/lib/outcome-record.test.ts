import { test } from "node:test";
import assert from "node:assert/strict";
import { heldPhrase, latestAcross, recordFor, sourceHost, weekLabel, type OutcomeRow } from "./outcome-record";

let n = 0;
const row = (over: Partial<OutcomeRow>): OutcomeRow => ({
  id: `r${++n}`,
  serviceId: "s1",
  result: "credited",
  amountBand: "1_to_10",
  route: "direct_shielded",
  weekOf: "2026-11-09",
  daysHeld: null,
  creditMinutes: null,
  sourceUrl: null,
  note: null,
  ...over,
});

test("recordFor: empty", () => {
  const r = recordFor([]);
  assert.equal(r.total, 0);
  assert.equal(r.latest, null);
  assert.equal(r.cases.length, 0);
  assert.equal(r.worked, null);
});

test("recordFor: under 3 private reports, only counts and the latest result show", () => {
  const r = recordFor([row({ weekOf: "2026-10-05", result: "rejected" }), row({ weekOf: "2026-11-02", result: "credited", route: "via_tex" })]);
  assert.equal(r.total, 2);
  assert.equal(r.detailed, false);
  assert.deepEqual(r.latest, { result: "credited", weekOf: "2026-11-02" });
  assert.deepEqual(r.counts, { rejected: 1, credited: 1 });
  assert.equal(r.cases.length, 0, "no private details below the threshold");
  assert.equal(r.worked, null, "the route is a detail too");
  assert.equal(r.trouble, 1);
});

test("recordFor: a report with a public source always shows its details", () => {
  const src = row({ weekOf: "2024-05-13", result: "rejected", sourceUrl: "https://forum.zcashcommunity.com/t/x/47667/1", note: "Refused." });
  const r = recordFor([src, row({ weekOf: "2026-11-02" })]);
  assert.deepEqual(r.cases.map((c) => c.id), [src.id]);
});

test("recordFor: from 3 reports, all details show, newest first, and the route that worked", () => {
  const rows = [
    row({ weekOf: "2026-09-14", result: "credited", route: "via_tex" }),
    row({ weekOf: "2026-11-02", result: "rejected" }),
    row({ weekOf: "2026-10-12", result: "credited", route: "unknown" }),
    row({ weekOf: "2026-10-26", result: "held_then_credited", daysHeld: 4, route: "direct_shielded" }),
  ];
  const r = recordFor(rows);
  assert.equal(r.detailed, true);
  assert.deepEqual(r.cases.map((c) => c.weekOf), ["2026-11-02", "2026-10-26", "2026-10-12", "2026-09-14"]);
  assert.deepEqual(r.worked, { route: "via_tex", weekOf: "2026-09-14" }, "a hold or an unknown route is not a route that worked");
  assert.equal(r.trouble, 2);
});

test("latestAcross: newest weeks first, capped", () => {
  const rows = [row({ weekOf: "2026-01-05" }), row({ weekOf: "2026-11-09" }), row({ weekOf: "2026-07-20" }), row({ weekOf: "2024-05-13" }), row({ weekOf: "2026-09-14" })];
  assert.deepEqual(latestAcross(rows, 3).map((r) => r.weekOf), ["2026-11-09", "2026-09-14", "2026-07-20"]);
});

test("labels", () => {
  assert.equal(weekLabel("2026-07-20"), "week of 20 Jul 2026");
  assert.equal(heldPhrase({ result: "held_open", daysHeld: 67 }), "held 67 days at the last update");
  assert.equal(heldPhrase({ result: "held_then_credited", daysHeld: 1 }), "held 1 day, then credited");
  assert.equal(heldPhrase({ result: "credited", daysHeld: null }), null);
  assert.equal(sourceHost("https://forum.zcashcommunity.com/t/a/1"), "Zcash forum");
  assert.equal(sourceHost("https://www.reddit.com/r/zec"), "reddit.com");
  assert.equal(sourceHost("not a url"), "source");
});
