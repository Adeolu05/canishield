// Public, read-only export of a board's evidence, for ZecHub, wallets and
// anyone else. GET /api/results.json            → mainnet
//               GET /api/results.json?network=testnet
// Everything here is already public on the board and service pages.
import { type NextRequest } from "next/server";
import { isNetworkId } from "@zecproof/zcash/networks";
import type { Report, Test } from "@zecproof/db";
import { READINESS, STALE_AFTER_DAYS, reportDate, testDate, type Cell } from "@/lib/evidence";
import { NETWORKS, basePath } from "@/lib/network";
import { getResults } from "@/lib/queries";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=60, s-maxage=300",
};

const ZECHUB = {
  source: "https://zechub.wiki/using-zcash/custodial-exchanges",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
  attribution: "Unverified listings are adapted from the ZecHub Wiki (ZecHub contributors), CC BY-SA 4.0.",
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function cellJson(cell: Cell) {
  if (cell.tier === "none") return { tier: "none" as const };
  const base = { tier: cell.tier, date: iso(cell.date), stale: cell.stale };
  return cell.tier === "verified"
    ? { ...base, outcome: cell.test.receivedPool, testId: cell.test.id }
    : { ...base, outcome: cell.report.outcome, reportId: cell.report.id, reviewStatus: cell.report.status };
}

function testJson(t: Test, slug: string, origin: string, network: "mainnet" | "testnet") {
  return {
    id: t.id,
    service: slug,
    addressType: t.addressType,
    sentTo: t.receiveAddress,
    landedIn: t.receivedPool,
    amountZat: t.receivedAmountZat,
    txid: t.receivedTxid,
    height: t.receivedHeight,
    blockHash: t.receivedBlockHash,
    memo: t.receivedMemo,
    viewingKey: t.ufvk,
    verifiedAt: iso(testDate(t)),
    explorer: t.explorerName ? { name: t.explorerName, confirmedAt: iso(t.explorerConfirmedAt) } : null,
    explorerUrl: t.receivedTxid ? NETWORKS[network].explorerTxUrl(t.receivedTxid) : null,
    page: `${origin}${basePath(network)}/services/${slug}`,
  };
}

function reportJson(r: Report, slug: string) {
  return {
    id: r.id,
    service: slug,
    addressType: r.addressType,
    outcome: r.outcome,
    date: iso(reportDate(r)),
    reviewStatus: r.status,
    note: r.note,
    txid: r.txid,
    evidenceUrl: r.evidenceUrl,
    testId: r.testId,
    ...(r.tier === "listing" ? { sourceUrl: r.sourceUrl, sourceReadAt: iso(r.sourceReadAt) } : {}),
  };
}

export async function GET(request: NextRequest) {
  const param = request.nextUrl.searchParams.get("network") ?? "mainnet";
  if (!isNetworkId(param)) {
    return Response.json({ error: 'network must be "mainnet" or "testnet"' }, { status: 400, headers: HEADERS });
  }
  const network = param;
  const origin = request.nextUrl.origin;
  const now = new Date();
  const { services, verified, visible, summary } = await getResults(network);
  const slugOf = new Map(services.map((s) => [s.id, s.slug]));

  const body = {
    format: "zecproof-results/1",
    network,
    generatedAt: now.toISOString(),
    staleAfterDays: STALE_AFTER_DAYS,
    tiers: {
      verified: "The scanner saw the payment land; txid and the test address's viewing key are published.",
      community: "Observed but not provable on-chain (e.g. a form rejected the address). reviewStatus shows admin review.",
      listing: "Imported from an existing list, never tested. sourceUrl and sourceReadAt say where and when it was read.",
    },
    readiness: {
      total: summary.total,
      counts: summary.counts,
      definitions: Object.fromEntries(Object.entries(READINESS).map(([k, v]) => [k, v.meaning])),
    },
    services: summary.rows.map(({ service, cells, readiness }) => ({
      slug: service.slug,
      name: service.name,
      kind: service.kind,
      website: service.websiteUrl,
      readiness,
      page: `${origin}${basePath(network)}/services/${service.slug}`,
      cells: Object.fromEntries(Object.entries(cells).map(([type, cell]) => [type, cellJson(cell)])),
    })),
    tests: verified.map((t) => testJson(t, slugOf.get(t.serviceId)!, origin, network)),
    communityReports: visible.filter((r) => r.tier === "community").map((r) => reportJson(r, slugOf.get(r.serviceId)!)),
    listings: visible.filter((r) => r.tier === "listing").map((r) => reportJson(r, slugOf.get(r.serviceId)!)),
    attribution: { listings: ZECHUB },
  };
  return Response.json(body, { headers: HEADERS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: HEADERS });
}
