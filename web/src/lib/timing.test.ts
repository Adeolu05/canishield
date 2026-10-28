import { test } from "node:test";
import assert from "node:assert/strict";
import { describeTiming, formatDuration, parseRequestedAt, summarizeTiming, timeToChainMs } from "./timing";

const t = (requested: string | null, block: string | null) => ({
  requestedAt: requested ? new Date(requested) : null,
  blockTime: block ? new Date(block) : null,
});

test("timing: time to chain is block time minus request time", () => {
  assert.equal(timeToChainMs(t("2026-11-05T10:00:00Z", "2026-11-05T10:14:00Z")), 14 * 60_000);
  assert.equal(timeToChainMs(t(null, "2026-11-05T10:14:00Z")), null);
  assert.equal(timeToChainMs(t("2026-11-05T10:00:00Z", null)), null);
});

test("timing: a block a little before the request (clock skew) counts as zero; far before is unusable", () => {
  assert.equal(timeToChainMs(t("2026-11-05T10:03:00Z", "2026-11-05T10:00:00Z")), 0);
  assert.equal(timeToChainMs(t("2026-11-05T10:30:00Z", "2026-11-05T10:00:00Z")), null);
});

test("timing: durations read as people would say them", () => {
  assert.equal(formatDuration(0), "under 3 min");
  assert.equal(formatDuration(170_000), "under 3 min");
  assert.equal(formatDuration(14 * 60_000), "14 min");
  assert.equal(formatDuration(89 * 60_000), "89 min");
  assert.equal(formatDuration(119 * 60_000), "1 h 59 min");
  assert.equal(formatDuration(130 * 60_000), "2 h 10 min");
  assert.equal(formatDuration(3 * 3600_000), "3 h");
  assert.equal(formatDuration(51 * 3600_000), "2 d 3 h");
});

test("timing: median and range over usable results only", () => {
  const s = summarizeTiming([
    t("2026-11-05T10:00:00Z", "2026-11-05T10:09:00Z"),
    t("2026-11-05T10:00:00Z", "2026-11-05T10:22:00Z"),
    t("2026-11-05T10:00:00Z", "2026-11-05T10:14:00Z"),
    t(null, "2026-11-05T10:14:00Z"),
  ]);
  assert.deepEqual(s, { count: 3, medianMs: 14 * 60_000, minMs: 9 * 60_000, maxMs: 22 * 60_000 });
  assert.equal(describeTiming(s!), "14 min (median of 3, 9 min to 22 min)");
  assert.equal(summarizeTiming([t(null, null)]), null);
  const two = summarizeTiming([t("2026-11-05T10:00:00Z", "2026-11-05T10:10:00Z"), t("2026-11-05T10:00:00Z", "2026-11-05T10:20:00Z")]);
  assert.equal(two?.medianMs, 15 * 60_000);
  assert.equal(describeTiming(summarizeTiming([t("2026-11-05T10:00:00Z", "2026-11-05T10:14:00Z")])!), "14 min");
});

test("timing: a request time in Lagos (UTC+1) is stored in UTC", () => {
  const r = parseRequestedAt("2026-11-05T11:00", "-60", { assignedAt: new Date("2026-11-05T09:00:00Z"), blockTime: null }, new Date("2026-11-05T12:00:00Z"));
  assert.deepEqual(r, { ok: true, value: new Date("2026-11-05T10:00:00Z") });
});

test("timing: impossible or implausible request times are refused with a reason", () => {
  const ctx = { assignedAt: new Date("2026-11-05T09:00:00Z"), blockTime: new Date("2026-11-05T10:00:00Z") };
  const now = new Date("2026-11-05T12:00:00Z");
  const err = (local: string | null, tz: string | null = "0") => {
    const r = parseRequestedAt(local, tz, ctx, now);
    return r.ok ? null : r.error;
  };
  assert.match(err("")!, /Enter the date/);
  assert.match(err("2026-11-05T09:30", "")!, /timezone/);
  assert.match(err("2026-11-05T09:30", "abc")!, /timezone/);
  assert.match(err("2026-11-05T09:30", null)!, /timezone/);
  assert.match(err("2026-02-30T09:30")!, /isn't valid/);
  assert.match(err("2026-11-05T25:00")!, /isn't valid/);
  assert.match(err("2026-11-05T13:00")!, /future/);
  assert.match(err("2026-11-05T08:00")!, /before this test's address existed/);
  assert.match(err("2026-11-05T10:30")!, /after the payment landed/);
  assert.equal(err("2026-11-05T09:30"), null);
});
