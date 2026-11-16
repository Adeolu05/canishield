// Atom feed of confirmed ZEC deposit/withdrawal pauses and reopenings, for
// feed readers and bots: GET /status/feed.xml
import { atomFeed } from "@/lib/live";
import { recentLiveEvents } from "@/lib/queries";
import { SITE_URL } from "@/lib/site";

export async function GET() {
  const events = await recentLiveEvents(50).catch(() => null);
  if (!events) return new Response("Live status is unavailable right now.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "300" } });
  return new Response(atomFeed(events, SITE_URL, new Date()), {
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=120",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
