import type { Metadata } from "next";
import { publishedDeposits } from "./deposit-checks";
import { depositSummary, newestDeposit } from "./deposit-core";
import { readinessOf } from "./evidence";
import type { NetworkId } from "./network";
import { verdictFor } from "./present";
import { getServiceDetail } from "./queries";

/** Title and description for a service page: its name and plain-language verdict. */
export async function serviceMetadata(network: NetworkId, slug: string): Promise<Metadata> {
  const detail = await getServiceDetail(network, slug);
  if (!detail) return { title: "Not found" };
  const visible = [...detail.communityReports, ...detail.listings];
  const v = verdictFor(readinessOf(detail.tests, visible), detail.tests, visible, new Date(), detail.research);
  const title = network === "testnet" ? `${detail.service.name} (testnet)` : detail.service.name;
  const deposit = newestDeposit(await publishedDeposits(network, detail.service.id).catch(() => []));
  const summary = deposit ? depositSummary(deposit) : null;
  const depositText = summary ? ` ${summary.text}.` : "";
  return { title, description: `${v.title}: ${v.detail}.${depositText} On-chain evidence with txids and viewing keys.` };
}
