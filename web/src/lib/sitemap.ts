// Which pages search engines and AI crawlers should find, and which they
// shouldn't. Pure, so it can be unit tested; app/sitemap.ts and app/robots.ts
// only add the site URL and the service list.
import type { MetadataRoute } from "next";

/** Pages worth indexing that aren't per-service. */
const STATIC_PAGES: Array<{ path: string; changeFrequency: "hourly" | "daily" | "weekly"; priority: number }> = [
  { path: "/", changeFrequency: "hourly", priority: 1 },
  { path: "/status", changeFrequency: "hourly", priority: 0.9 },
  { path: "/nu7", changeFrequency: "weekly", priority: 0.6 },
  { path: "/report/outcome", changeFrequency: "weekly", priority: 0.5 },
  { path: "/testnet", changeFrequency: "daily", priority: 0.4 },
];

/**
 * Not for crawlers: single test pages (one per payment, with a test address and
 * a browser token), the forms behind them, and raw evidence files. The board,
 * service pages and data feeds stay open.
 */
export const DISALLOW = ["/test/", "/testnet/test/", "/report/form-check", "/report/outcome/thanks", "/api/evidence/"];

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function buildSitemap(site: string, mainnet: string[], testnet: string[], now: Date): MetadataRoute.Sitemap {
  const ok = (slugs: string[]) => [...new Set(slugs)].filter((s) => SLUG_RE.test(s)).sort();
  return [
    ...STATIC_PAGES.map((p) => ({ url: `${site}${p.path === "/" ? "" : p.path}`, lastModified: now, changeFrequency: p.changeFrequency, priority: p.priority })),
    ...ok(mainnet).map((s) => ({ url: `${site}/services/${s}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.7 })),
    ...ok(testnet).map((s) => ({ url: `${site}/testnet/services/${s}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.3 })),
  ];
}

export function buildRobots(site: string): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: DISALLOW },
    sitemap: `${site}/sitemap.xml`,
  };
}
