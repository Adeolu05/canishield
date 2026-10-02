import type { Metadata } from "next";
import { readinessOf } from "./evidence";
import type { NetworkId } from "./network";
import { verdictFor } from "./present";
import { getServiceDetail } from "./queries";

/** Title and description for a service page: its name and plain-language verdict. */
export async function serviceMetadata(network: NetworkId, slug: string): Promise<Metadata> {
  const detail = await getServiceDetail(network, slug);
  if (!detail) return { title: "Not found" };
  const visible = [...detail.communityReports, ...detail.listings];
  const v = verdictFor(readinessOf(detail.tests, visible), detail.tests, visible);
  const title = network === "testnet" ? `${detail.service.name} (testnet)` : detail.service.name;
  return { title, description: `${v.title} — ${v.detail}. On-chain evidence with txids and viewing keys.` };
}
