// The embeddable "Before you send" card, for other sites to show in an iframe:
//   <iframe src="https://canishield.vercel.app/embed/binance" ...></iframe>
// A route handler (not a page) so it carries none of the site's chrome and
// sets its own headers: any site may frame it, and it runs no script at all.
import { type NextRequest } from "next/server";
import { embedTheme } from "@/lib/embed";
import { renderEmbedHtml } from "@/lib/embed-html";
import { loadEmbed } from "@/lib/embed-data";

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  // No script, no forms, nothing loaded from elsewhere. No frame-ancestors on
  // purpose: any site or app may frame it ("*" would still refuse app:// and file://).
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cache-Control": "public, max-age=60, s-maxage=300",
};

export async function GET(request: NextRequest, ctx: RouteContext<"/embed/[slug]">) {
  const { slug } = await ctx.params;
  const summary = await loadEmbed(slug);
  if (!summary) {
    return new Response("Not found: embeds exist for exchanges and swaps on the mainnet board.", {
      status: 404,
      headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const theme = embedTheme(request.nextUrl.searchParams.get("theme"));
  return new Response(renderEmbedHtml(summary, { theme }), { headers: HEADERS });
}
