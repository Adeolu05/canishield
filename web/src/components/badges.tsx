import type { ReportOutcome } from "@zecproof/db";
import { OUTCOME_LABEL, TIER_LABEL, type Tier } from "@/lib/labels";

const OUTCOME_STYLE: Record<ReportOutcome, string> = {
  ironwood: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  orchard: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  sapling: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  transparent: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200",
  address_rejected: "bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100",
  form_accepted: "bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-200",
};

const TIER_STYLE: Record<Tier, string> = {
  verified: "border-emerald-600/40 text-emerald-700 dark:text-emerald-300",
  community: "border-zinc-500/40 text-zinc-600 dark:text-zinc-300",
  listing: "border-dashed border-zinc-400/60 text-zinc-500 dark:text-zinc-400",
};

const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium";

/** A pool, or a form outcome ("Address rejected", "Form accepted"). */
export function OutcomeBadge({ outcome }: { outcome: ReportOutcome }) {
  return <span className={`${base} ${OUTCOME_STYLE[outcome]}`}>{OUTCOME_LABEL[outcome]}</span>;
}

export function TierBadge({ tier }: { tier: Tier }) {
  return <span className={`${base} border ${TIER_STYLE[tier]}`}>{TIER_LABEL[tier]}</span>;
}
