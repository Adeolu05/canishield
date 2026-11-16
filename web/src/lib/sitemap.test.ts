import { test } from "node:test";
import assert from "node:assert/strict";
import { DISALLOW, buildRobots, buildSitemap } from "./sitemap";

const SITE = "https://canishield.vercel.app";
const NOW = new Date("2026-11-16T12:00:00Z");

test("sitemap: main pages, then every service page, with no duplicates or odd slugs", () => {
  const map = buildSitemap(SITE, ["kraken", "binance", "binance", "../etc", "Bad Slug"], ["zingo"], NOW);
  const urls = map.map((e) => e.url);
  assert.deepEqual(urls.slice(0, 5), [SITE, `${SITE}/status`, `${SITE}/nu7`, `${SITE}/report/outcome`, `${SITE}/testnet`]);
  assert.deepEqual(urls.slice(5), [`${SITE}/services/binance`, `${SITE}/services/kraken`, `${SITE}/testnet/services/zingo`]);
  assert.equal(map[0].priority, 1);
});

test("sitemap: still lists the main pages when the database gives nothing", () => {
  assert.equal(buildSitemap(SITE, [], [], NOW).length, 5);
});

test("robots: open site, single tests and raw evidence kept out, sitemap linked", () => {
  const r = buildRobots(SITE);
  assert.deepEqual(r.rules, { userAgent: "*", allow: "/", disallow: DISALLOW });
  assert.equal(r.sitemap, `${SITE}/sitemap.xml`);
  for (const path of ["/test/", "/testnet/test/", "/api/evidence/"]) assert.ok(DISALLOW.includes(path), path);
  for (const open of ["/services/", "/status", "/api/results.json"]) assert.ok(!DISALLOW.some((d) => open.startsWith(d)), open);
});
