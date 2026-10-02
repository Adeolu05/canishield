import assert from "node:assert/strict";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import { encodePng, iconCandidates, icoToPng, manifestIcons, manifestUrls, mergeCandidates, sniff, svgIsSafe } from "./icons";

/** Decode our own RGBA PNGs (filter 0 only) for assertions. */
function readPng(png: Uint8Array) {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let o = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  while (o < png.length) {
    const len = v.getUint32(o);
    const type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    const data = png.subarray(o + 8, o + 8 + len);
    if (type === "IHDR") [width, height] = [v.getUint32(o + 8), v.getUint32(o + 12)];
    if (type === "IDAT") idat.push(data);
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const px = (x: number, y: number) => [...raw.subarray(y * (width * 4 + 1) + 1 + x * 4, y * (width * 4 + 1) + 1 + x * 4 + 4)];
  return { width, height, px };
}

/** A BITMAPINFOHEADER DIB frame as stored in a .ico (height doubled for the AND mask). */
function dib(w: number, h: number, bpp: number, pixels: Uint8Array, opts: { palette?: number[][]; mask?: Uint8Array } = {}) {
  const head = new Uint8Array(40);
  const v = new DataView(head.buffer);
  v.setUint32(0, 40, true);
  v.setInt32(4, w, true);
  v.setInt32(8, h * 2, true);
  v.setUint16(12, 1, true);
  v.setUint16(14, bpp, true);
  v.setUint32(32, opts.palette?.length ?? 0, true);
  const pal = new Uint8Array((opts.palette ?? []).flatMap(([r, g, b]) => [b, g, r, 0]));
  return Buffer.concat([head, pal, pixels, opts.mask ?? new Uint8Array(Math.ceil(w / 32) * 4 * h)]);
}

function ico(frames: { w: number; h: number; bpp: number; data: Uint8Array }[]) {
  const dir = new Uint8Array(6 + frames.length * 16);
  const v = new DataView(dir.buffer);
  v.setUint16(2, 1, true);
  v.setUint16(4, frames.length, true);
  let at = dir.length;
  frames.forEach((f, i) => {
    const e = 6 + i * 16;
    dir[e] = f.w % 256;
    dir[e + 1] = f.h % 256;
    v.setUint16(e + 4, 1, true);
    v.setUint16(e + 6, f.bpp, true);
    v.setUint32(e + 8, f.data.length, true);
    v.setUint32(e + 12, at, true);
    at += f.data.length;
  });
  return new Uint8Array(Buffer.concat([dir, ...frames.map((f) => f.data)]));
}

test("prefers SVG, then the largest apple-touch-icon; .ico last and mask icons never", () => {
  const html = `<head>
    <link rel="icon" href="/favicon.ico">
    <link rel="mask-icon" href="/pin.svg" color="#000">
    <link rel="apple-touch-icon" sizes="120x120" href="/t120.png">
    <link rel="apple-touch-icon" sizes="180x180" href="https://cdn.example.com/t180.png">
    <link rel="icon" type="image/svg+xml" href="icon.svg?v=2">
  </head>`;
  const urls = iconCandidates(html, "https://example.com/en/").map((c) => c.url);
  assert.deepEqual(urls.slice(0, 3), ["https://example.com/en/icon.svg?v=2", "https://cdn.example.com/t180.png", "https://example.com/t120.png"]);
  assert.ok(!urls.some((u) => u.endsWith("pin.svg")));
  assert.ok(urls.includes("https://example.com/apple-touch-icon.png"));
  const ico = urls.filter((u) => u.endsWith(".ico"));
  assert.deepEqual(ico, ["https://example.com/favicon.ico"]);
  assert.ok(urls.indexOf(ico[0]) > urls.indexOf("https://example.com/favicon.png"), ".ico is the last resort");
});

test("reads web app manifests: the declared one first, then the usual paths", () => {
  const html = `<link rel="manifest" href="/static/app.webmanifest">`;
  assert.deepEqual(manifestUrls(html, "https://ex.com/"), [
    "https://ex.com/static/app.webmanifest",
    "https://ex.com/manifest.json",
    "https://ex.com/site.webmanifest",
    "https://ex.com/manifest.webmanifest",
  ]);
  const icons = manifestIcons(
    {
      icons: [
        { src: "icons/192.png", sizes: "192x192", type: "image/png" },
        { src: "icons/1024.png", sizes: "1024x1024", type: "image/png" },
        { src: "icons/mono.png", sizes: "512x512", purpose: "monochrome" },
        { src: "http://ex.com/insecure.png", sizes: "512x512" },
        { src: 42 },
      ],
    },
    "https://ex.com/static/app.webmanifest",
  );
  assert.deepEqual(icons.map((i) => i.url), ["https://ex.com/static/icons/1024.png", "https://ex.com/static/icons/192.png"]);
  assert.deepEqual(manifestIcons({ name: "no icons" }, "https://ex.com/m.json"), []);
  assert.deepEqual(manifestIcons(null, "https://ex.com/m.json"), []);
  const merged = mergeCandidates([{ url: "https://ex.com/a.png", score: 150 }], icons);
  assert.equal(merged[0].url, "https://ex.com/static/icons/1024.png", "a 512px+ manifest icon beats a small <link> PNG");
});

test("sniff trusts bytes, not file names", () => {
  assert.equal(sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "png");
  assert.equal(sniff(new TextEncoder().encode(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>`)), "svg");
  assert.equal(sniff(new TextEncoder().encode("<!doctype html><html>")), null);
  assert.equal(sniff(new Uint8Array([0, 0, 1, 0, 1, 0, 16, 16, 0])), "ico");
});

test(".ico: picks the largest frame and passes an embedded PNG through", () => {
  const big = encodePng(2, 2, new Uint8Array(16).fill(200));
  const small = dib(1, 1, 32, new Uint8Array([1, 2, 3, 255]));
  const out = icoToPng(ico([{ w: 1, h: 1, bpp: 32, data: small }, { w: 2, h: 2, bpp: 32, data: big }]))!;
  assert.deepEqual([...out], [...big]);
});

test(".ico: 32-bit BMP frame becomes a PNG with its alpha, rows flipped upright", () => {
  // 2x2, stored bottom-up as BGRA: bottom row first.
  const px = new Uint8Array([
    /* bottom-left */ 0, 0, 255, 255, /* bottom-right */ 0, 255, 0, 128,
    /* top-left */ 255, 0, 0, 255, /* top-right */ 0, 0, 0, 0,
  ]);
  const png = icoToPng(ico([{ w: 2, h: 2, bpp: 32, data: dib(2, 2, 32, px) }]))!;
  assert.equal(sniff(png), "png");
  const img = readPng(png);
  assert.deepEqual([img.width, img.height], [2, 2]);
  assert.deepEqual(img.px(0, 0), [0, 0, 255, 255], "top-left is blue");
  assert.deepEqual(img.px(1, 0), [0, 0, 0, 0], "top-right transparent");
  assert.deepEqual(img.px(0, 1), [255, 0, 0, 255], "bottom-left is red");
  assert.deepEqual(img.px(1, 1), [0, 255, 0, 128]);
});

test(".ico: 24-bit and 4-bit palette frames use the AND mask for transparency", () => {
  // 2x1, 24-bit: row padded to 8 bytes. Mask: left pixel transparent (bit 7 set).
  const px24 = new Uint8Array([10, 20, 30, 40, 50, 60, 0, 0]);
  const mask = new Uint8Array([0x80, 0, 0, 0]);
  const a = readPng(icoToPng(ico([{ w: 2, h: 1, bpp: 24, data: dib(2, 1, 24, px24, { mask }) }]))!);
  assert.deepEqual(a.px(0, 0), [30, 20, 10, 0]);
  assert.deepEqual(a.px(1, 0), [60, 50, 40, 255]);
  // 2x1, 4-bit: indexes 1 then 0 packed in one byte, row padded to 4 bytes.
  const px4 = new Uint8Array([0x10, 0, 0, 0]);
  const b = readPng(icoToPng(ico([{ w: 2, h: 1, bpp: 4, data: dib(2, 1, 4, px4, { palette: [[0, 0, 0], [255, 128, 0]] }) }]))!);
  assert.deepEqual(b.px(0, 0), [255, 128, 0, 255]);
  assert.deepEqual(b.px(1, 0), [0, 0, 0, 255]);
});

test(".ico: malformed files are refused, not guessed at", () => {
  assert.equal(icoToPng(new Uint8Array([0, 0, 1, 0, 0, 0])), null, "no frames");
  assert.equal(icoToPng(new Uint8Array([0, 0, 1, 0, 1, 0, ...new Array(16).fill(0xff)])), null, "frame points past the end");
  const truncated = ico([{ w: 16, h: 16, bpp: 32, data: dib(16, 16, 32, new Uint8Array(16 * 16 * 4)) }]).subarray(0, 200);
  assert.equal(icoToPng(truncated), null, "truncated pixels");
  assert.equal(icoToPng(new TextEncoder().encode("<html>")), null);
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
