// Live ZEC deposit/withdrawal status of every exchange we read, as JSON:
//   GET /api/status.json
// From each exchange's own public API; about ZEC in general, never about
// shielded support. CORS-open, CC BY 4.0.
import { BRAND } from "@/lib/brand";
import { LIVE_STALE_MS, NOT_LIVE, liveJson, presentLive } from "@/lib/live";
import { liveStatuses, recentLiveEvents } from "@/lib/queries";
import { SITE_URL } from "@/lib/site";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=60, s-maxage=60",
};

export async function GET() {
  const now = new Date();
  const [rows, events] = await Promise.all([liveStatuses().catch(() => null), recentLiveEvents(20).catch(() => null)]);
  if (!rows || !events) return Response.json({ error: "Live status is unavailable right now." }, { status: 503, headers: { ...HEADERS, "Retry-After": "300" } });
  return Response.json(
    {
      format: "canishield-status/1",
      source: { name: BRAND.name, url: `${SITE_URL}/status` },
      generatedAt: now.toISOString(),
      staleAfterMinutes: LIVE_STALE_MS / 60_000,
      exchanges: rows.map((r) => ({ slug: r.slug, name: r.name, url: `${SITE_URL}/services/${r.slug}`, ...liveJson(presentLive(r, now)) })),
      notReadLive: Object.entries(NOT_LIVE).map(([slug, reason]) => ({ slug, reason })),
      recentChanges: events.map((e) => ({ slug: e.slug, name: e.name, side: e.side, from: e.fromState, to: e.toState, at: e.at.toISOString() })),
      license: { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/", attribution: BRAND.compact },
    },
    { headers: HEADERS },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: HEADERS });
}
