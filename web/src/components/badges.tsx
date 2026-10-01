import type { Pool } from "@zecproof/db";
import { POOL_LABEL } from "@/lib/labels";

const POOL_STYLE: Record<Pool, string> = {
  ironwood: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  orchard: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  sapling: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  transparent: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200",
};

const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium";

export function PoolBadge({ pool }: { pool: Pool }) {
  return <span className={`${base} ${POOL_STYLE[pool]}`}>{POOL_LABEL[pool]}</span>;
}

export function RejectedBadge() {
  return <span className={`${base} bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100`}>Rejected address</span>;
}

export function TierBadge({ tier }: { tier: "verified" | "reported" }) {
  return tier === "verified" ? (
    <span className={`${base} border border-emerald-600/40 text-emerald-700 dark:text-emerald-300`}>On-chain verified</span>
  ) : (
    <span className={`${base} border border-zinc-500/40 text-zinc-600 dark:text-zinc-300`}>User-reported</span>
  );
}
