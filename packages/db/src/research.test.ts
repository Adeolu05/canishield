import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PRODUCTS, parseResearch } from "./research";

const md = readFileSync(new URL("../../../docs/research/orb-zec-research-2026-10-02-v2.md", import.meta.url), "utf8");
const { claims, skipped } = parseResearch(md);
const bySlug = Object.fromEntries(claims.map((c) => [c.slug, c]));

test("every research row is mapped or deliberately skipped", () => {
  assert.equal(claims.length + skipped.length, 42);
  assert.deepEqual(skipped.map((s) => s.product).sort(), ["Zallet", "zcash-walletd", "zcashd wallet", "zecd"]);
  assert.throws(() => parseResearch(md.replace("**Vizor**", "**Vizor Pro**")), /not in PRODUCTS/);
});

test("claims follow the research's own status columns", () => {
  const expect: Record<string, string> = {
    zodl: "ironwood_supported",
    "cake-wallet": "ironwood_supported",
    "noir-wallet": "shielded_supported",
    trezor: "transparent_only",
    exodus: "transparent_only",
    "trust-wallet": "shielded_not_claimed",
    gemini: "ironwood_supported",
    coinbase: "transparent_only", // outbound only to transparent addresses
    kraken: "transparent_only",
    binance: "shielded_not_claimed",
    bitcoinvn: "shielded_supported",
    leodex: "ironwood_supported",
    changenow: "shielded_not_claimed",
  };
  for (const [slug, claim] of Object.entries(expect)) assert.equal(bySlug[slug]?.claim, claim, slug);
});

test("corrections: KuCoin and YWallet dropped ZEC, Bitget is disputed", () => {
  assert.equal(bySlug.kucoin.claim, "no_longer_supported");
  assert.equal(bySlug.ywallet.claim, "no_longer_supported");
  assert.equal(bySlug.bitget.claim, "listing_disputed");
  assert.match(bySlug.kucoin.officialUrl, /^https:\/\/www\.kucoin\.com\//);
  assert.match(bySlug.kucoin.detail, /delisted/);
});

test("every claim links its official https source and carries no em dash", () => {
  for (const c of claims) {
    assert.match(c.officialUrl, /^https:\/\/\S+$/, c.product);
    assert.ok(!c.detail.includes("—"), c.product);
    assert.ok(!/^(✅|❌|⚠|❓)/u.test(c.detail), `${c.product}: status mark left in detail`);
  }
});

test("server-only tools never reach the board", () => {
  for (const p of ["zecd", "zcash-walletd", "Zallet"]) assert.ok("skip" in PRODUCTS[p]);
  assert.ok(!claims.some((c) => /walletd|zallet|zecd/i.test(c.slug)));
});
