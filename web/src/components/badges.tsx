// Badges for single results and claims, built on the status primitives.
import type { ReportOutcome } from "@zecproof/db";
import { LISTED_CLAIM, sourceName } from "@/lib/evidence";
import { OUTCOME_VISUAL } from "@/lib/present";
import type { Tier } from "@/lib/labels";
import { StaleChip, StatusIcon, TONE_SOFT, TierChip } from "./status";

const pill = "inline-flex items-center gap-2 rounded-md px-2 py-0.5 text-xs font-medium";

/** A pool, or a form outcome. Only for verified tests and community reports. */
export function OutcomeBadge({ outcome }: { outcome: ReportOutcome }) {
  const v = OUTCOME_VISUAL[outcome];
  return (
    <span className={`${pill} ${TONE_SOFT[v.tone]}`}>
      <StatusIcon icon={v.icon} className="size-3.5" />
      {v.label}
    </span>
  );
}

export function TierBadge({ tier }: { tier: Tier }) {
  return <TierChip tier={tier} />;
}

export function StaleBadge() {
  return <StaleChip />;
}

/** An unverified listing's claim: neutral, dashed, never a result colour. */
export function ListedClaimBadge({ outcome }: { outcome: ReportOutcome }) {
  return (
    <span className={`${pill} border border-dashed border-line-strong bg-listed-soft text-listed`}>
      <StatusIcon icon="file-text" className="size-3.5" />
      {LISTED_CLAIM[outcome].label}
    </span>
  );
}

/** Tier chip plus "per <source>" for a listing. */
export function ListingSource({ sourceUrl }: { sourceUrl: string | null }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <TierChip tier="listing" />
      <span className="text-xs text-subtle">per {sourceName(sourceUrl)}</span>
    </span>
  );
}
