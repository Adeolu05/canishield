import { test } from "node:test";
import assert from "node:assert/strict";
import { NU7_HEIGHT, formatRemaining, nu7State } from "./nu7";

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
