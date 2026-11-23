import type { Metadata } from "next";
import { publishedDeposits } from "./deposit-checks";
import { depositSummary, newestDeposit } from "./deposit-core";
import { readinessOf, reportDate, testDate } from "./evidence";
import type { NetworkId } from "./network";
import { describeResearch, latestDate, plainStatus, zecHubListing } from "./plain";
import { getServiceDetail } from "./queries";

/** Title and description for a service page: its name and plain-language verdict. */
export async function serviceMetadata(network: NetworkId, slug: string): Promise<Metadata> {
  const detail = await getServiceDetail(network, slug);
  if (!detail) return { title: "Not found" };
  const visible = [...detail.communityReports, ...detail.listings];
  const readiness = readinessOf(detail.tests, visible);
  const status = plainStatus({
    readiness,
    ownCheckedAt: latestDate([...detail.tests.map(testDate), ...detail.communityReports.map(reportDate)]),
    listingReadAt: latestDate(detail.listings.map(reportDate)),
    researchReadAt: latestDate(detail.research.map((r) => r.readAt)),
    zecHub: zecHubListing(detail.listings),
    researchSentence: describeResearch(detail.research, visible),
  });
  const title = network === "testnet" ? `${detail.service.name} (testnet)` : detail.service.name;
  const deposit = newestDeposit(await publishedDeposits(network, detail.service.id).catch(() => []));
  const summary = deposit ? depositSummary(deposit) : null;
  const depositText = summary ? ` ${summary.text}.` : "";
  // A txid and viewing key exist only for a verified withdrawal, not for a deposit check.
  const evidence = detail.tests.some((t) => t.receivedTxid && t.ufvk) ? " Includes an on-chain transaction id and viewing key." : "";
  const path = `${network === "testnet" ? "/testnet" : ""}/services/${detail.service.slug}`;
  return { title, description: `${status.line}${depositText}${evidence}`, alternates: { canonical: path } };
}
