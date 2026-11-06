// Liveness of the scanner worker for one network, for the header pill.
// GET /api/scanner-status?network=mainnet|testnet
import { type NextRequest } from "next/server";
import { isNetworkId } from "@zecproof/zcash/networks";
import { getScannerHeartbeat } from "@/lib/queries";

/** The worker polls every 30 s; two missed cycles means offline. */
const ONLINE_WITHIN_SECONDS = 90;

export async function GET(request: NextRequest) {
  const network = request.nextUrl.searchParams.get("network") ?? "mainnet";
  if (!isNetworkId(network)) return Response.json({ error: "unknown network" }, { status: 400 });
  const hb = await getScannerHeartbeat(network);
  const ageSeconds = hb ? Math.max(0, Math.round((Date.now() - hb.seenAt.getTime()) / 1000)) : null;
  return Response.json(
    {
      network,
      online: ageSeconds !== null && ageSeconds <= ONLINE_WITHIN_SECONDS,
      tip: hb?.tip ?? null,
      seenAt: hb?.seenAt.toISOString() ?? null,
      ageSeconds,
    },
    // Cached at the CDN for 15 s: every open tab polls this, and the heartbeat only
    // changes every 30 s anyway. The pill recomputes liveness from seenAt on the
    // client, so a cached answer never shows a dead scanner as online for long.
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=15, stale-while-revalidate=15" } },
  );
}
