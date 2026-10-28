import { test } from "node:test";
import assert from "node:assert/strict";
import { hashTesterToken, newTesterToken, testerCookieName, tokenMatches } from "./tester-token-core";

test("tester token: only the token itself matches its stored hash", () => {
  const { token, hash } = newTesterToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(hash, hashTesterToken(token));
  assert.notEqual(hash, token, "the token itself is never what gets stored");
  assert.equal(tokenMatches(token, hash), true);
  assert.equal(tokenMatches(newTesterToken().token, hash), false);
  assert.equal(tokenMatches(undefined, hash), false);
  assert.equal(tokenMatches(token, null), false, "tests created before tokens existed can't be edited");
  assert.equal(tokenMatches(token, "not-hex"), false);
});

test("tester token: one cookie per test", () => {
  assert.equal(testerCookieName("abc"), "cis_tester_abc");
});
