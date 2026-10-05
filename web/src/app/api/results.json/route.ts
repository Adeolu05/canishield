// Public, read-only export of a board's evidence, for ZecHub, wallets and
// anyone else. GET /api/results.json            → mainnet
//               GET /api/results.json?network=testnet
// Everything here is already public on the board and service pages.
import { type NextRequest } from "next/server";
import { isNetworkId } from "@zecproof/zcash/networks";
import type { Report, Test } from "@zecproof/db";
import { LISTED_CLAIM, READINESS, STALE_AFTER_DAYS, isStale, reportDate, sourceName, testDate, type Cell } from "@/lib/evidence";
import { NETWORKS, basePath } from "@/lib/network";
import { getResults } from "@/lib/queries";
import { RESEARCH_CLAIM, RESEARCH_SOURCES, researchJson } from "@/lib/research";
import { methodJson } from "@/lib/form-check";

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=60, s-maxage=300",
};

/** ZecProof's own results: verified tests, community reports and readiness counts. */
const RESULTS_LICENSE = {
  name: "CC BY 4.0",
  url: "https://creativecommons.org/licenses/by/4.0/",
  appliesTo: ["tests", "communityReports", "readiness", "services[].cells with tier verified or community"],
  attribution: "ZecProof",
  note: "Unverified listings are licensed separately; see listingsLicense. ZecProof's code is MIT.",
};

/** Third-party listings keep their source's license, separate from the above. */
const LISTINGS_LICENSE = {
  name: "CC BY-SA 4.0",
  url: "https://creativecommons.org/licenses/by-sa/4.0/",
  appliesTo: ["listings", "services[].cells with tier listing"],
  source: "https://zechub.wiki/using-zcash/custodial-exchanges",
  attribution: "Adapted from the ZecHub Wiki (ZecHub contributors), CC BY-SA 4.0.",
};

/** Community research: contributed claims, credited to their researcher. Not covered by either license above. */
const RESEARCH_CREDIT = Object.fromEntries(
  Object.entries(RESEARCH_SOURCES).map(([key, s]) => [key, { name: s.name, credit: s.credit, url: s.url, secondaryUrl: s.secondary?.url ?? null }]),
);

const iso = (d: Date | null) => (d ? d.toISOString() : null);

// Listings never share a field name with results: tests and community reports
// carry `outcome`; listings carry `listedClaim` (see LISTED_CLAIM codes).
function cellJson(cell: Cell) {
  if (cell.tier === "none") return { tier: "none" as const };
  const base = { tier: cell.tier, date: iso(cell.date), stale: cell.stale };
  if (cell.tier === "verified") return { ...base, outcome: cell.test.receivedPool, testId: cell.test.id };
  if (cell.tier === "community") {
    return { ...base, outcome: cell.report.outcome, method: cell.report.method, reportId: cell.report.id, reviewStatus: cell.report.status };
  }
  return {
    ...base,
    listedClaim: LISTED_CLAIM[cell.report.outcome].code,
    source: sourceName(cell.report.sourceUrl),
    listingId: cell.report.id,
  };
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

function communityJson(r: Report, slug: string) {
  return {
    id: r.id,
    service: slug,
    addressType: r.addressType,
    outcome: r.outcome,
    date: iso(reportDate(r)),
    reviewStatus: r.status,
    reviewedBy: r.reviewedBy,
    reviewedAt: iso(r.reviewedAt),
    note: r.note,
    txid: r.txid,
    evidenceUrl: r.evidenceUrl,
    testId: r.testId,
    // How it was observed: null for a tester's mark during a test; "withdrawal_form_check"
    // when a reference address was pasted into the form and not submitted.
    ...methodJson(r),
  };
}

function listingJson(r: Report, slug: string, now: Date) {
  return {
    id: r.id,
    service: slug,
    addressType: r.addressType,
    listedClaim: LISTED_CLAIM[r.outcome].code,
    listedClaimLabel: LISTED_CLAIM[r.outcome].label,
    source: sourceName(r.sourceUrl),
    sourceUrl: r.sourceUrl,
    sourceReadAt: iso(r.sourceReadAt),
    stale: isStale(reportDate(r), now),
    note: r.note,
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
  const { services, verified, visible, research, summary } = await getResults(network);
  const slugOf = new Map(services.map((s) => [s.id, s.slug]));

  const body = {
    format: "zecproof-results/1",
    network,
    generatedAt: now.toISOString(),
    staleAfterDays: STALE_AFTER_DAYS,
    tiers: {
      verified: "The scanner saw the payment land; txid and the test address's viewing key are published.",
      community:
        "Observed but not provable on-chain (e.g. a form rejected the address). reviewStatus shows admin review. method \"withdrawal_form_check\": a reference address was pasted into the withdrawal form and not submitted (no key, no funds); form_accepted is never a verification.",
      listing: "Imported from an existing list, never tested. Carries listedClaim (not outcome); sourceUrl and sourceReadAt say where and when it was read.",
      research:
        "Community research: a product-level claim read from the product's official page by a contributor. Never tested, never in cells or readiness. Carries researchClaim (not outcome or listedClaim) and officialUrl; see the research field.",
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
    communityReports: visible.filter((r) => r.tier === "community").map((r) => communityJson(r, slugOf.get(r.serviceId)!)),
    listings: visible.filter((r) => r.tier === "listing").map((r) => listingJson(r, slugOf.get(r.serviceId)!, now)),
    research: research.map((r) => researchJson(r, slugOf.get(r.serviceId)!, now, visible)),
    listedClaimCodes: Object.fromEntries(Object.values(LISTED_CLAIM).map((c) => [c.code, c.label])),
    researchClaimCodes: Object.fromEntries(Object.entries(RESEARCH_CLAIM).map(([code, c]) => [code, c.label])),
    researchCredit: RESEARCH_CREDIT,
    license: { ...RESULTS_LICENSE, attribution: `ZecProof (${origin})` },
    listingsLicense: LISTINGS_LICENSE,
  };
  return Response.json(body, { headers: HEADERS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: HEADERS });
}
