import { test } from "node:test";
import assert from "node:assert/strict";
import { openTestKey, parseOpenTests, poolIsFull, rememberOpenTest } from "./open-tests-core";

const S = "11111111-2222-4333-8444-555555555555";
const T1 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const T2 = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";

test("open tests: one entry per network, service and address type", () => {
  assert.equal(openTestKey("mainnet", S, "ironwood_ua"), `mainnet:${S}:ironwood_ua`);
});

test("open tests: a bad or tampered cookie reads as empty, never throws", () => {
  assert.deepEqual(parseOpenTests(undefined), {});
  assert.deepEqual(parseOpenTests("not json"), {});
  assert.deepEqual(parseOpenTests("[1,2]"), {});
  assert.deepEqual(parseOpenTests(JSON.stringify({ "x:y:z": T1 })), {});
  assert.deepEqual(parseOpenTests(JSON.stringify({ [openTestKey("mainnet", S, "full_ua")]: "drop table" })), {});
  const ok = { [openTestKey("mainnet", S, "full_ua")]: T1 };
  assert.deepEqual(parseOpenTests(JSON.stringify(ok)), ok);
});

test("open tests: remembering replaces the same key and keeps the cookie small", () => {
  const k = openTestKey("mainnet", S, "full_ua");
  assert.deepEqual(rememberOpenTest({ [k]: T1 }, k, T2), { [k]: T2 });
  let m = {};
  for (let i = 0; i < 20; i++) m = rememberOpenTest(m, openTestKey("testnet", S.slice(0, 35) + (i % 10), "transparent") + i, T1);
  assert.ok(Object.keys(m).length <= 12);
});

test("open tests: refuse a mainnet test once waiting tests would use every key left", () => {
  assert.equal(poolIsFull(0, 5), false);
  assert.equal(poolIsFull(4, 5), false);
  assert.equal(poolIsFull(5, 5), true);
  assert.equal(poolIsFull(0, 0), true);
});
