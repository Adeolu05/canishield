import Link from "next/link";
import { CircleCheck, CircleHelp, CirclePause, Radio } from "lucide-react";
import { LIVE_LABEL, ago, type LiveState, type LiveView } from "@/lib/live";

const PILL: Record<LiveState, { cls: string; Icon: typeof CircleCheck }> = {
  open: { cls: "bg-ok-soft text-ok", Icon: CircleCheck },
  paused: { cls: "bg-bad-soft text-bad", Icon: CirclePause },
  unknown: { cls: "bg-surface-2 text-subtle", Icon: CircleHelp },
};

export function LivePill({ state, label }: { state: LiveState; label?: string }) {
  const { cls, Icon } = PILL[state];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>
      <Icon aria-hidden="true" className="size-3.5" />
      {label ? <span className="sr-only">{label}: </span> : null}
      {LIVE_LABEL[state]}
    </span>
  );
}

/** The service page's "right now" line: ZEC deposits and withdrawals, from the exchange's own API. */
export function LiveLine({ v, now }: { v: LiveView; now: Date }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm shadow-card">
      <span className="inline-flex w-full items-center gap-1.5 font-medium sm:w-auto">
        <Radio aria-hidden="true" className="size-4 text-accent-ink" /> ZEC right now
      </span>
      <span className="inline-flex items-center gap-1.5 text-muted">
        Deposits <LivePill state={v.deposit} />
      </span>
      <span className="inline-flex items-center gap-1.5 text-muted">
        Withdrawals <LivePill state={v.withdraw} />
      </span>
      <span className="text-xs text-subtle">
        {v.fresh ? `${v.source}, checked ${ago(v.checkedAt, now)}.` : "Not checked recently."}
        {v.fresh && v.note ? ` ${v.note[0].toUpperCase()}${v.note.slice(1)}.` : ""} About ZEC in general, not shielded support.{" "}
        <Link href="/status" className="font-medium text-accent-ink underline-offset-4 hover:underline">
          All exchanges
        </Link>
      </span>
    </div>
  );
}
