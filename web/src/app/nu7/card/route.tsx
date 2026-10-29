// Live share card: GET /nu7/card?f=wide|square|story (PNG). Extra query
// parameters (the page adds ?b=<blocks left>) only vary the URL, so social
// sites that cache previews by URL fetch a fresh card as the count drops.
import { type NextRequest } from "next/server";
import { getNu7Snapshot } from "@/lib/nu7-data";
import { isCardFormat, nu7Card } from "@/lib/nu7-card";

export async function GET(request: NextRequest) {
  const f = request.nextUrl.searchParams.get("f");
  const format = isCardFormat(f) ? f : "wide";
  return nu7Card(format, await getNu7Snapshot());
}
