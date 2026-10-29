import { test } from "node:test";
import assert from "node:assert/strict";
import { canReportNotCredited, depositsEnabledFor, parseCreditedAt, parseTxid, parseZec, zecExact } from "./deposit-core";

test("deposit-core: the switch is per network", () => {
  assert.equal(depositsEnabledFor(undefined, "testnet"), false);
  assert.equal(depositsEnabledFor("testnet", "testnet"), true);
  assert.equal(depositsEnabledFor("testnet", "mainnet"), false);
  assert.equal(depositsEnabledFor("mainnet, testnet", "mainnet"), true);
  assert.equal(depositsEnabledFor("yes", "mainnet"), true);
});

test("deposit-core: amounts parse to whole zatoshis and print exactly", () => {
  assert.equal(parseZec("0.01"), 1_000_000);
  assert.equal(parseZec("0,01"), 1_000_000);
  assert.equal(parseZec("1"), 100_000_000);
  assert.equal(parseZec("0.00000001"), 1);
  assert.equal(parseZec("0.000000001"), null, "9 decimals");
  assert.equal(parseZec("0"), null);
  assert.equal(parseZec("-1"), null);
  assert.equal(parseZec("1e3"), null);
  assert.equal(zecExact(1_004_217), "0.01004217");
  assert.equal(zecExact(123_000_000_01), "123.00000001");
});

test("deposit-core: txids", () => {
  assert.equal(parseTxid(` ${"AB".repeat(32)} `), "ab".repeat(32));
  assert.equal(parseTxid("ab".repeat(31)), null);
  assert.equal(parseTxid("zz".repeat(32)), null);
});

test("deposit-core: credited time is after the block and not in the future", () => {
  const block = new Date("2026-11-06T10:00:00Z");
  const now = new Date("2026-11-06T12:00:00Z");
  assert.deepEqual(parseCreditedAt("2026-11-06T11:30", "-60", block, now), { ok: true, value: new Date("2026-11-06T10:30:00Z") });
  assert.match((parseCreditedAt("2026-11-06T09:00", "0", block, now) as { error: string }).error, /before the payment landed/);
  assert.match((parseCreditedAt("2026-11-06T13:00", "0", block, now) as { error: string }).error, /future/);
  assert.match((parseCreditedAt("", "0", block, now) as { error: string }).error, /Enter/);
  assert.match((parseCreditedAt("2026-11-06T11:00", "", block, now) as { error: string }).error, /timezone/);
  assert.equal(canReportNotCredited(block, new Date("2026-11-07T09:59:00Z")), false);
  assert.equal(canReportNotCredited(block, new Date("2026-11-07T10:00:00Z")), true);
  assert.equal(canReportNotCredited(null), false);
});
