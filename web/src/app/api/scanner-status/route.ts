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
    { headers: { "Cache-Control": "no-store" } },
  );
}
