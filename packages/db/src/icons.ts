// Helpers for fetch-icons.ts: find a site's icon links, check what came back,
// and turn a .ico into a PNG locally. Pure functions, so they can be tested
// without the network.
import { deflateSync } from "node:zlib";

/** What we store. A .ico is converted to PNG before saving. */
export type IconFormat = "png" | "svg";

export interface IconCandidate {
  url: string;
  /** Rough preference: higher is better. */
  score: number;
}

const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(1).find((v) => v !== undefined);

const resolve = (href: string, base: string) => {
  try {
    return new URL(href.replace(/&amp;/g, "&"), base).href;
  } catch {
    return null;
  }
};

const largest = (sizes: string | undefined) => Math.max(0, ...(sizes ?? "").split(/\s+/).map((s) => parseInt(s, 10) || 0));
const isSvgUrl = (url: string, type = "") => type.includes("svg") || /\.svg(\?|$)/i.test(url);
const isIcoUrl = (url: string, type = "") => /icon$|x-icon|vnd\.microsoft\.icon/.test(type) || /\.ico(\?|$)/i.test(url);

// Scores: SVG > large PNG > small PNG > conventional paths > .ico (converted).
const ICO_SCORE = 20;

const dedupe = (cs: IconCandidate[]) => {
  const seen = new Set<string>();
  return cs.sort((a, b) => b.score - a.score).filter((c) => !seen.has(c.url) && seen.add(c.url));
};

/**
 * Icon URLs declared in a page's <head>, best first: SVG icons, then large PNGs
 * (apple-touch-icon is usually 180px), then the conventional fallbacks, then
 * .ico files (converted to PNG locally).
 */
export function iconCandidates(html: string, pageUrl: string): IconCandidate[] {
  const out: IconCandidate[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attr(tag, "rel")?.toLowerCase() ?? "";
    const href = attr(tag, "href");
    if (!href || !/\b(icon|apple-touch-icon(-precomposed)?|mask-icon)\b/.test(rel)) continue;
    if (rel.includes("mask-icon")) continue; // single-colour Safari pin icon; renders black
    const url = resolve(href, pageUrl);
    if (!url) continue;
    const type = attr(tag, "type")?.toLowerCase() ?? "";
    const size = largest(attr(tag, "sizes"));
    const score = isSvgUrl(url, type) ? 1000 : isIcoUrl(url, type) ? ICO_SCORE + 5 : rel.includes("apple-touch-icon") ? 500 + size : 100 + size;
    out.push({ url, score });
  }
  const origin = new URL(pageUrl).origin;
  out.push(
    { url: `${origin}/apple-touch-icon.png`, score: 50 },
    { url: `${origin}/favicon.svg`, score: 40 },
    { url: `${origin}/favicon.png`, score: 30 },
    { url: `${origin}/favicon.ico`, score: ICO_SCORE },
  );
  return dedupe(out);
}

/** Web app manifests to try: the page's <link rel="manifest">, then the usual paths. */
export function manifestUrls(html: string, pageUrl: string): string[] {
  const out: string[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/\bmanifest\b/i.test(attr(tag, "rel") ?? "")) continue;
    const url = resolve(attr(tag, "href") ?? "", pageUrl);
    if (url) out.push(url);
  }
  const origin = new URL(pageUrl).origin;
  out.push(`${origin}/manifest.json`, `${origin}/site.webmanifest`, `${origin}/manifest.webmanifest`);
  return [...new Set(out)];
}

/** Icons listed in a web app manifest, scored like <link> icons. Monochrome icons are skipped. */
export function manifestIcons(json: unknown, manifestUrl: string): IconCandidate[] {
  const icons = (json as { icons?: unknown })?.icons;
  if (!Array.isArray(icons)) return [];
  const out: IconCandidate[] = [];
  for (const i of icons as { src?: unknown; sizes?: unknown; type?: unknown; purpose?: unknown }[]) {
    if (typeof i?.src !== "string") continue;
    if (typeof i.purpose === "string" && i.purpose.split(/\s+/).every((p) => p === "monochrome")) continue;
    const url = resolve(i.src, manifestUrl);
    if (!url?.startsWith("https://")) continue;
    const type = typeof i.type === "string" ? i.type.toLowerCase() : "";
    const size = largest(typeof i.sizes === "string" ? i.sizes : undefined);
    // Up to 512px is plenty; bigger files tend to hit the size limit.
    out.push({ url, score: isSvgUrl(url, type) ? 900 : isIcoUrl(url, type) ? ICO_SCORE + 5 : 100 + Math.min(size, 512) });
  }
  return dedupe(out);
}

/** Merge candidate lists, best first, each URL once. */
export const mergeCandidates = (...lists: IconCandidate[][]) => dedupe(lists.flat());

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const startsWith = (b: Uint8Array, sig: number[], at = 0) => b.length >= at + sig.length && sig.every((x, i) => b[at + i] === x);

/** What the bytes actually are, regardless of the server's content type. */
export function sniff(bytes: Uint8Array): IconFormat | "ico" | null {
  if (startsWith(bytes, PNG_SIG)) return "png";
  if (bytes.length >= 6 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return "ico";
  const head = new TextDecoder().decode(bytes.subarray(0, 2048)).trimStart().toLowerCase();
  if ((head.startsWith("<svg") || head.startsWith("<?xml")) && head.includes("<svg")) return "svg";
  return null;
}

/**
 * SVGs are served from our own origin, so refuse anything that could run or
 * load something: scripts, event handlers, foreignObject, external references.
 */
export function svgIsSafe(text: string): boolean {
  const t = text.toLowerCase();
  if (/<script\b|<foreignobject\b|<iframe\b|<embed\b|<object\b|<!entity/.test(t)) return false;
  if (/\son[a-z]+\s*=/.test(t)) return false;
  if (/javascript:|data:text\/html/.test(t)) return false;
  // Only in-document references (#id) and inline data images are allowed.
  for (const m of t.matchAll(/(?:xlink:)?href\s*=\s*["']([^"']*)["']/g)) {
    if (!m[1].startsWith("#") && !m[1].startsWith("data:image/")) return false;
  }
  if (/url\(\s*["']?(?!#)/.test(t)) return false;
  return true;
}

// ---- .ico → PNG ------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC_TABLE[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function pngChunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A minimal RGBA8 PNG encoder (no filtering), enough for small icons. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit, RGBA, deflate, no filter, no interlace
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  const parts = [Uint8Array.from(PNG_SIG), pngChunk("IHDR", ihdr), pngChunk("IDAT", new Uint8Array(deflateSync(raw))), pngChunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Decode a .ico frame stored as a Windows DIB (BMP without file header) into RGBA. */
function decodeDib(d: Uint8Array, dirW: number, dirH: number): { width: number; height: number; rgba: Uint8Array } | null {
  if (d.length < 40) return null;
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const headerSize = v.getUint32(0, true);
  if (headerSize < 40 || headerSize > d.length) return null;
  const width = Math.abs(v.getInt32(4, true)) || dirW;
  const fullHeight = v.getInt32(8, true); // XOR image + AND mask, so twice the icon height
  const height = Math.abs(fullHeight) / 2 || dirH;
  const bpp = v.getUint16(14, true);
  const compression = v.getUint32(16, true);
  const colorsUsed = v.getUint32(32, true);
  if (!Number.isInteger(height) || width < 1 || height < 1 || width > 256 || height > 256) return null;
  if (![1, 4, 8, 24, 32].includes(bpp)) return null;
  if (compression !== 0 && !(compression === 3 && bpp === 32)) return null; // BI_RGB, or BI_BITFIELDS for 32-bit
  let off = headerSize + (compression === 3 && headerSize === 40 ? 12 : 0);
  const palette: number[][] = [];
  if (bpp <= 8) {
    const n = colorsUsed || 1 << bpp;
    if (off + n * 4 > d.length) return null;
    for (let i = 0; i < n; i++) palette.push([d[off + i * 4 + 2], d[off + i * 4 + 1], d[off + i * 4]]);
    off += n * 4;
  }
  const stride = Math.ceil((width * bpp) / 32) * 4;
  const maskStride = Math.ceil(width / 32) * 4;
  if (off + stride * height > d.length) return null;
  const maskOff = off + stride * height;
  const hasMask = maskOff + maskStride * height <= d.length;
  const bottomUp = fullHeight > 0;
  const rgba = new Uint8Array(width * height * 4);
  let anyAlpha = false;
  for (let y = 0; y < height; y++) {
    const row = off + (bottomUp ? height - 1 - y : y) * stride;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (bpp === 32 || bpp === 24) {
        const p = row + x * (bpp / 8);
        rgba[o] = d[p + 2];
        rgba[o + 1] = d[p + 1];
        rgba[o + 2] = d[p];
        rgba[o + 3] = bpp === 32 ? d[p + 3] : 255;
        if (bpp === 32 && d[p + 3]) anyAlpha = true;
      } else {
        const bit = x * bpp;
        const idx = (d[row + (bit >> 3)] >> (8 - bpp - (bit & 7))) & ((1 << bpp) - 1);
        const c = palette[idx] ?? [0, 0, 0];
        rgba.set([c[0], c[1], c[2], 255], o);
      }
    }
  }
  // Without real alpha, the 1-bit AND mask says which pixels are transparent.
  if (!(bpp === 32 && anyAlpha) && hasMask) {
    for (let y = 0; y < height; y++) {
      const row = maskOff + (bottomUp ? height - 1 - y : y) * maskStride;
      for (let x = 0; x < width; x++) if ((d[row + (x >> 3)] >> (7 - (x & 7))) & 1) rgba[(y * width + x) * 4 + 3] = 0;
    }
  } else if (bpp === 32 && !anyAlpha) {
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  }
  return { width, height, rgba };
}

/**
 * The largest frame of a .ico as PNG bytes, or null if the file is malformed.
 * Frames that are already PNG are passed through unchanged.
 */
export function icoToPng(bytes: Uint8Array): Uint8Array | null {
  if (sniff(bytes) !== "ico") return null;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = v.getUint16(4, true);
  if (count < 1 || count > 64 || 6 + count * 16 > bytes.length) return null;
  let best: { w: number; h: number; bpp: number; data: Uint8Array } | null = null;
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16;
    const w = bytes[e] || 256;
    const h = bytes[e + 1] || 256;
    const bpp = v.getUint16(e + 6, true);
    const size = v.getUint32(e + 8, true);
    const at = v.getUint32(e + 12, true);
    if (size < 8 || at + size > bytes.length) continue;
    if (!best || w * h > best.w * best.h || (w * h === best.w * best.h && bpp > best.bpp)) {
      best = { w, h, bpp, data: bytes.subarray(at, at + size) };
    }
  }
  if (!best) return null;
  if (startsWith(best.data, PNG_SIG)) return Uint8Array.from(best.data);
  const img = decodeDib(best.data, best.w, best.h);
  return img ? encodePng(img.width, img.height, img.rgba) : null;
}
