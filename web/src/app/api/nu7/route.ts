// Live NU7 data for the countdown page: scanner tip, recent block headers, pace
// and the estimate. GET /api/nu7. Cached at the edge for a few seconds, so a
// burst of visitors doesn't turn into a burst of database reads.
import { getNu7Snapshot } from "@/lib/nu7-data";

export async function GET() {
  const snapshot = await getNu7Snapshot();
  return Response.json(snapshot, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=25", "Access-Control-Allow-Origin": "*" },
  });
}
