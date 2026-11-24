import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseZecHubMarkdown } from "./zechub-md";
import { parseSnapshot } from "./listings";

const md = readFileSync(new URL("../data/zechub-custodial-exchanges.md", import.meta.url), "utf8");
const snap = parseSnapshot(JSON.parse(readFileSync(new URL("../data/zechub-custodial-exchanges.json", import.meta.url), "utf8")));

test("the snapshot is the parser's reading of the saved ZecHub page", () => {
  assert.deepEqual(parseZecHubMarkdown(md), snap.exchanges);
});

test("HTX stays the existing huobi row, and shielded wording is not invented", () => {
  const parsed = parseZecHubMarkdown(md);
  const htx = parsed.find((e) => e.slug === "huobi");
  assert.equal(htx?.name, "HTX");
  assert.equal(htx?.website, "https://www.htx.com");
  assert.equal(htx?.claims.ironwood_ua, "address_rejected");

  const gemini = parsed.find((e) => e.slug === "gemini");
  assert.equal(gemini?.claims.full_ua, "form_accepted");
  assert.equal(gemini?.claims.ironwood_ua, "form_accepted");
  assert.match(gemini?.supports ?? "", /unified withdrawals/i);

  const bitcoin = parsed.find((e) => e.slug === "bitcoinvn");
  assert.equal(bitcoin?.claims.ironwood_ua, undefined);
  assert.equal(bitcoin?.claims.full_ua, undefined);
  assert.match(bitcoin?.supports ?? "", /Shielded \(z-address/);

  assert.equal(parsed.find((e) => e.slug === "altquick")?.claims.transparent, "transparent");
  assert.equal(Object.keys(parsed.find((e) => e.slug === "backpack")?.claims ?? {}).length, 0);
});
