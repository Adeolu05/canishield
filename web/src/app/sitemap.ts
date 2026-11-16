import type { MetadataRoute } from "next";
import { buildSitemap } from "@/lib/sitemap";
import { listServices } from "@/lib/queries";
import { SITE_URL } from "@/lib/site";

// Every service page on the board, plus the main pages. A database problem only
// drops the service pages: the main pages are always listed.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [mainnet, testnet] = await Promise.all([
    listServices("mainnet").catch(() => []),
    listServices("testnet").catch(() => []),
  ]);
  return buildSitemap(
    SITE_URL,
    mainnet.map((s) => s.slug),
    testnet.map((s) => s.slug),
    new Date(),
  );
}
