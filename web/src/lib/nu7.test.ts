import { test } from "node:test";
import assert from "node:assert/strict";
import { NU7_HEIGHT, averageSpacing, clockParts, contiguousTail, estimateSpacing, formatRemaining, nu7State } from "./nu7";

test("nu7: unknown without a tip", () => {
  assert.deepEqual(nu7State(null, null), { phase: "unknown" });
  assert.deepEqual(nu7State(0, 0), { phase: "unknown" });
  assert.deepEqual(nu7State(Number.NaN, 0), { phase: "unknown" });
});

test("nu7: blocks left and an estimate at 75 s per block, from when the tip was seen", () => {
  const seen = Date.UTC(2026, 9, 29, 7, 0, 0);
  const s = nu7State(NU7_HEIGHT - 1000, seen);
  assert.equal(s.phase, "upcoming");
  if (s.phase !== "upcoming") return;
  assert.equal(s.blocksLeft, 1000);
  assert.equal(s.etaMs, seen + 1000 * 75_000);
});

test("nu7: live from the activation height itself", () => {
  assert.deepEqual(nu7State(NU7_HEIGHT, 0), { phase: "live", tip: NU7_HEIGHT, blocksSince: 0 });
  assert.deepEqual(nu7State(NU7_HEIGHT + 12, 0), { phase: "live", tip: NU7_HEIGHT + 12, blocksSince: 12 });
});

test("nu7: remaining time reads as people would say it", () => {
  assert.equal(formatRemaining(-5), "under a minute");
  assert.equal(formatRemaining(30_000), "under a minute");
  assert.equal(formatRemaining(12 * 60_000), "12 min");
  assert.equal(formatRemaining(3 * 3600_000), "3 h");
  assert.equal(formatRemaining(3 * 3600_000 + 12 * 60_000), "3 h 12 min");
  assert.equal(formatRemaining(6 * 86_400_000 + 14 * 3600_000 + 59 * 60_000), "6 d 14 h");
  assert.equal(formatRemaining(2 * 86_400_000), "2 d");
});

test("nu7: the estimate uses the given spacing and anchor", () => {
  const s = nu7State(NU7_HEIGHT - 100, 1_000_000, NU7_HEIGHT, 75.4);
  assert.equal(s.phase === "upcoming" && s.etaMs, 1_000_000 + 100 * 75_400);
});

test("nu7: the newest consecutive run of blocks, oldest first", () => {
  const b = (h: number) => ({ h, t: h * 1000 });
  assert.deepEqual(contiguousTail([b(5), b(1), b(2), b(6), b(7), b(7), b(3)]).map((x) => x.h), [5, 6, 7]);
  assert.deepEqual(contiguousTail([b(9)]).map((x) => x.h), [9]);
  assert.deepEqual(contiguousTail([]), []);
});

test("nu7: average spacing is end to end over the newest run, within a height range", () => {
  const blocks = Array.from({ length: 31 }, (_, i) => ({ h: 100 + i, t: i * 75_000 + (i % 2 ? 9000 : 0) }));
  assert.deepEqual(averageSpacing(blocks), { seconds: 75, intervals: 30 });
  assert.equal(averageSpacing(blocks.slice(0, 5)), null, "too few intervals");
  assert.deepEqual(averageSpacing(blocks, { n: 10 }), { seconds: 75, intervals: 10 });
  assert.equal(averageSpacing(blocks, { maxHeight: 105 }), null);
  // After NU7: only the blocks above the height count.
  const after = [...blocks, ...Array.from({ length: 12 }, (_, i) => ({ h: 131 + i, t: 30 * 75_000 + (i + 1) * 25_000 }))];
  assert.deepEqual(averageSpacing(after, { minHeight: 131, minIntervals: 5 }), { seconds: 25, intervals: 11 });
});

test("nu7: the estimate spacing is the measured pace kept in a sane range", () => {
  assert.equal(estimateSpacing(null), 75);
  assert.equal(estimateSpacing({ seconds: 75.4, intervals: 100 }), 75.4);
  assert.equal(estimateSpacing({ seconds: 30, intervals: 12 }), 60);
  assert.equal(estimateSpacing({ seconds: 200, intervals: 12 }), 90);
});

test("nu7: clock parts", () => {
  assert.deepEqual(clockParts(((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000 + 999), { d: 2, h: 3, m: 4, s: 5 });
  assert.deepEqual(clockParts(-1), { d: 0, h: 0, m: 0, s: 0 });
});
