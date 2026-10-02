// Helpers for fetch-icons.ts: find a site's icon links, check what came back.
// Pure functions, so they can be tested without the network.

export type IconFormat = "png" | "svg";

export interface IconCandidate {
  url: string;
  /** Rough preference: higher is better. */
  score: number;
}

const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(1).find((v) => v !== undefined);

/**
 * Icon URLs declared in a page's <head>, best first: SVG icons, then large PNGs
 * (apple-touch-icon is usually 180px), then the conventional fallbacks.
 */
export function iconCandidates(html: string, pageUrl: string): IconCandidate[] {
  const out: IconCandidate[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attr(tag, "rel")?.toLowerCase() ?? "";
    const href = attr(tag, "href");
    if (!href || !/\b(icon|apple-touch-icon(-precomposed)?|mask-icon)\b/.test(rel)) continue;
    if (rel.includes("mask-icon")) continue; // single-colour Safari pin icon; renders black
    let url: string;
    try {
      url = new URL(href.replace(/&amp;/g, "&"), pageUrl).href;
    } catch {
      continue;
    }
    const type = attr(tag, "type")?.toLowerCase() ?? "";
    const size = Math.max(0, ...(attr(tag, "sizes") ?? "").split(/\s+/).map((s) => parseInt(s, 10) || 0));
    const svg = type.includes("svg") || /\.svg(\?|$)/i.test(url);
    const ico = type.includes("icon") || /\.ico(\?|$)/i.test(url);
    if (ico) continue; // we only store PNG or SVG
    const score = svg ? 1000 : rel.includes("apple-touch-icon") ? 500 + size : 100 + size;
    out.push({ url, score });
  }
  const origin = new URL(pageUrl).origin;
  out.push({ url: `${origin}/apple-touch-icon.png`, score: 50 }, { url: `${origin}/favicon.svg`, score: 40 }, { url: `${origin}/favicon.png`, score: 30 });
  const seen = new Set<string>();
  return out.sort((a, b) => b.score - a.score).filter((c) => !seen.has(c.url) && seen.add(c.url));
}

/** What the bytes actually are, regardless of the server's content type. */
export function sniff(bytes: Uint8Array): IconFormat | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
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
