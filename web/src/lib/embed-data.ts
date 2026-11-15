import "server-only";
import { depositService, acceptedOutcomes } from "./queries";
import { publishedDeposits } from "./deposit-checks";
import { outcomeReportsEnabled } from "./network";
import { SITE_URL } from "./site";
import { embedSummary, type EmbedSummary } from "./embed";

/** The before-you-send summary for a mainnet exchange or swap; null for anything else. */
export async function loadEmbed(slug: string): Promise<EmbedSummary | null> {
  const service = await depositService(slug);
  if (!service) return null;
  const [deposits, outcomes] = await Promise.all([publishedDeposits("mainnet", service.id), acceptedOutcomes("mainnet", service.id)]);
  return embedSummary({ service, deposits, outcomes, siteUrl: SITE_URL, reportOpen: outcomeReportsEnabled() });
}
