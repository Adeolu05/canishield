import assert from "node:assert/strict";
import { test } from "node:test";
import { iconCandidates, sniff, svgIsSafe } from "./icons";

test("prefers SVG, then the largest apple-touch-icon, and skips .ico and mask icons", () => {
  const html = `<head>
    <link rel="icon" href="/favicon.ico">
    <link rel="mask-icon" href="/pin.svg" color="#000">
    <link rel="apple-touch-icon" sizes="120x120" href="/t120.png">
    <link rel="apple-touch-icon" sizes="180x180" href="https://cdn.example.com/t180.png">
    <link rel="icon" type="image/svg+xml" href="icon.svg?v=2">
  </head>`;
  const urls = iconCandidates(html, "https://example.com/en/").map((c) => c.url);
  assert.deepEqual(urls.slice(0, 3), ["https://example.com/en/icon.svg?v=2", "https://cdn.example.com/t180.png", "https://example.com/t120.png"]);
  assert.ok(!urls.some((u) => u.endsWith(".ico") || u.endsWith("pin.svg")));
  assert.ok(urls.includes("https://example.com/apple-touch-icon.png"));
});

test("sniff trusts bytes, not file names", () => {
  assert.equal(sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "png");
  assert.equal(sniff(new TextEncoder().encode(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>`)), "svg");
  assert.equal(sniff(new TextEncoder().encode("<!doctype html><html>")), null);
  assert.equal(sniff(new Uint8Array([0, 0, 1, 0, 1, 0, 16, 16, 0])), null); // .ico
});

test("svgIsSafe rejects anything that could run or load", () => {
  const ok = `<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"/></defs><rect fill="url(#g)"/><use href="#g"/></svg>`;
  assert.ok(svgIsSafe(ok));
  for (const bad of [
    `<svg><script>alert(1)</script></svg>`,
    `<svg onload="alert(1)"></svg>`,
    `<svg><a href="javascript:alert(1)"><rect/></a></svg>`,
    `<svg><image href="https://tracker.example/p.png"/></svg>`,
    `<svg><foreignObject><div/></foreignObject></svg>`,
    `<svg><rect style="fill:url(https://x.example/a)"/></svg>`,
  ]) {
    assert.equal(svgIsSafe(bad), false, bad);
  }
});
