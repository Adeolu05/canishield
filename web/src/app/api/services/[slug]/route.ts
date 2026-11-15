// One service's before-you-send summary as JSON, for sites that draw their own:
//   GET /api/services/binance
// The same data as the embeddable card (/embed/binance). Mainnet exchanges and
// swaps only. Everything here is already public on the service page.
import { loadEmbed } from "@/lib/embed-data";
import { BRAND } from "@/lib/brand";
import { SITE_URL } from "@/lib/site";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=60, s-maxage=300",
};

export async function GET(_request: Request, ctx: RouteContext<"/api/services/[slug]">) {
  const { slug } = await ctx.params;
  const summary = await loadEmbed(slug);
  if (!summary) {
    return Response.json({ error: "Not found: this covers exchanges and swaps on the mainnet board." }, { status: 404, headers: HEADERS });
  }
  return Response.json(
    {
      format: "canishield-service/1",
      source: { name: BRAND.name, url: SITE_URL },
      generatedAt: new Date().toISOString(),
      ...summary,
      embed: `${SITE_URL}/embed/${encodeURIComponent(summary.service.slug)}`,
      license: { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/", attribution: BRAND.compact },
    },
    { headers: HEADERS },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: HEADERS });
}
