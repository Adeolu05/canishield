// OG image renderers for the board and service pages, per network.
import { readinessOf } from "./evidence";
import type { NetworkId } from "./network";
import { ogImage } from "./og";
import { READINESS_ORDER, READINESS_VISUAL, verdictFor } from "./present";
import { getBoard, getServiceDetail } from "./queries";

export async function boardOgImage(network: NetworkId) {
  const { counts, total } = await getBoard(network);
  const lines = READINESS_ORDER.filter((k) => counts[k] > 0).map((k) => ({
    text: `${counts[k]} ${READINESS_VISUAL[k].label.toLowerCase()}`,
    tone: READINESS_VISUAL[k].tone,
  }));
  return ogImage({
    network,
    eyebrow: network === "mainnet" ? "Ironwood readiness" : "Testnet rehearsal board",
    title: `Can I send shielded ${network === "mainnet" ? "ZEC" : "TAZ"} to…`,
    lines: [{ text: `${total} services tracked` }, ...lines.slice(0, 3)],
  });
}

export async function serviceOgImage(network: NetworkId, slug: string) {
  const detail = await getServiceDetail(network, slug);
  if (!detail) {
    return ogImage({ network, eyebrow: "ZecProof", title: "Service not found", lines: [] });
  }
  const visible = [...detail.communityReports, ...detail.listings];
  const v = verdictFor(readinessOf(detail.tests, visible), detail.tests, visible, new Date(), detail.research);
  return ogImage({
    network,
    eyebrow: detail.service.kind,
    title: detail.service.name,
    lines: [{ text: v.title, tone: v.tone }, { text: v.detail }],
  });
}
