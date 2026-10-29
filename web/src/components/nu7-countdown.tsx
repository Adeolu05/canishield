"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, TriangleAlert } from "lucide-react";
import { useNow } from "./live";
import { useScannerStatus } from "./scanner-pill";
import { NU7_HEIGHT, NU7_PLANNED_DATE, POST_NU7_SPACING_S, PRE_NU7_SPACING_S, formatRemaining, nu7State } from "@/lib/nu7";

const fmt = (n: number) => n.toLocaleString("en-US");

export interface InitialTip {
  tip: number | null;
  seenAt: string | null;
}

const plural = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`;

/**
 * NU7 progress from the mainnet scanner's heartbeat; the server's tip until the first poll lands.
 * Keeps the highest tip seen, so a failed poll (status null) can't send "live" back to a countdown.
 */
function useNu7(initial: InitialTip) {
  const { status, online, known } = useScannerStatus("mainnet");
  const now = useNow();
  const [best, setBest] = useState<InitialTip>(initial);
  // Derived state, updated during render (no effect): only ever moves forward.
  if (status?.tip && status.seenAt && (best.tip == null || status.tip > best.tip)) {
    setBest({ tip: status.tip, seenAt: status.seenAt });
  }
  const state = nu7State(best.tip, best.seenAt ? new Date(best.seenAt).getTime() : null);
  // Before hydration there is no clock: count the remaining blocks at 75 s, which
  // server and client agree on. After it, count down to the estimate.
  const remainingMs = state.phase === "upcoming" ? (now === null ? state.blocksLeft * PRE_NU7_SPACING_S * 1000 : state.etaMs - now) : 0;
  // Past the estimate but not yet at the height: blocks have been slower than 75 s.
  const overdue = state.phase === "upcoming" && now !== null && remainingMs <= 0;
  // Only say "offline" once a poll has answered; before that the server's tip stands.
  const stale = known && !online;
  return { state, now, remainingMs, overdue, stale };
}

const ETA_PARTS = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } as const;
const LOCAL_ETA = new Intl.DateTimeFormat(undefined, ETA_PARTS);
const UTC_ETA = new Intl.DateTimeFormat("en-GB", { ...ETA_PARTS, timeZone: "UTC" });

/** The big countdown card on /nu7. */
export function Nu7Countdown({ initial }: { initial: InitialTip }) {
  const { state, now, remainingMs, overdue, stale } = useNu7(initial);
  const label = "font-mono text-[11px] uppercase tracking-[0.14em] text-subtle";
  return (
    <aside
      aria-labelledby="nu7-countdown"
      className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8 [box-shadow:var(--shadow-card),var(--shadow-glow)]"
    >
      <h2 id="nu7-countdown" className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-ink">
        {state.phase === "live" ? "Upgrade status" : "Countdown"}
      </h2>

      {state.phase === "upcoming" && (
        <>
          <p className="mt-6 text-6xl font-semibold leading-none tracking-tight tabular-nums sm:text-7xl">{fmt(state.blocksLeft)}</p>
          <p className="mt-2 text-sm text-muted">{state.blocksLeft === 1 ? "block" : "blocks"} to go</p>
          <p className="mt-6 text-lg font-medium">
            {overdue ? "Any moment now" : <>About <span className="tabular-nums">{formatRemaining(remainingMs)}</span></>}
          </p>
          <p className="mt-1 min-h-5 text-sm text-muted">
            {now !== null && !overdue && (
              <>
                Expected around{" "}
                <time dateTime={new Date(state.etaMs).toISOString()} title={new Date(state.etaMs).toUTCString()} className="tabular-nums">
                  {LOCAL_ETA.format(state.etaMs)}
                </time>{" "}
                your time <span className="whitespace-nowrap text-subtle">({UTC_ETA.format(state.etaMs)} UTC)</span>
              </>
            )}
          </p>
        </>
      )}

      {state.phase === "live" && (
        <>
          <p className="mt-6 inline-flex items-center gap-2 text-3xl font-semibold tracking-tight">
            <CircleCheck aria-hidden="true" className="size-8 text-ok" /> NU7 is live
          </p>
          <p className="mt-4 text-sm text-muted">
            Activated at block <span className="tabular-nums">{fmt(NU7_HEIGHT)}</span>
            {state.blocksSince > 0 ? <>, <span className="tabular-nums">{plural(state.blocksSince, "block", "blocks")}</span> ago</> : ", the latest block"}.
            Blocks now target {POST_NU7_SPACING_S} seconds.
          </p>
        </>
      )}

      {state.phase === "unknown" && (
        <p className="mt-6 text-lg">
          Activates at block <span className="font-semibold tabular-nums">{fmt(NU7_HEIGHT)}</span>, planned for around {NU7_PLANNED_DATE}.
          The live countdown appears when our scanner is reachable.
        </p>
      )}

      {stale && state.phase !== "unknown" && (
        <p role="status" className="mt-6 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          Our scanner is offline right now. Last seen at block {fmt(state.tip)}, so this may be behind the chain.
        </p>
      )}

      <dl className="mt-6 divide-y divide-dashed divide-line-strong/60 border-y border-dashed border-line-strong/60 text-sm">
        <div className="flex items-baseline justify-between gap-4 py-2">
          <dt className={label}>Current block</dt>
          <dd className="font-mono text-xs tabular-nums">{state.phase === "unknown" ? "…" : fmt(state.tip)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-2">
          <dt className={label}>Activation block</dt>
          <dd className="font-mono text-xs tabular-nums">{fmt(NU7_HEIGHT)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-2">
          <dt className={label}>Block time</dt>
          <dd className="text-xs">
            {state.phase === "live" ? `${POST_NU7_SPACING_S} s (was ${PRE_NU7_SPACING_S} s)` : `${PRE_NU7_SPACING_S} s now, ${POST_NU7_SPACING_S} s after`}
          </dd>
        </div>
      </dl>
      {state.phase === "upcoming" && (
        <p className="mt-4 text-xs text-subtle">
          An estimate. Blocks arrive at random intervals, so the time can drift by hours; the block height is what&apos;s fixed. Read from
          our mainnet scanner.
        </p>
      )}
    </aside>
  );
}

/** One line above the home hero: how far away NU7 is, and where to read what to do. */
export function Nu7Strip({ initial }: { initial: InitialTip }) {
  const { state, remainingMs, overdue } = useNu7(initial);
  return (
    <Link
      href="/nu7"
      className="group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-accent/40 bg-surface px-4 py-3 text-sm transition-colors duration-150 hover:border-accent"
    >
      <span className="inline-flex h-6 items-center rounded-full bg-accent px-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#18181b]">
        NU7
      </span>
      <span className="min-w-0 flex-1 text-muted">
        {state.phase === "upcoming" && (
          <>
            <span className="font-medium text-foreground">
              {overdue ? "Network upgrade any moment now" : `Network upgrade in about ${formatRemaining(remainingMs)}`}
            </span>
            , at block <span className="tabular-nums">{fmt(NU7_HEIGHT)}</span> (
            <span className="tabular-nums">{plural(state.blocksLeft, "block", "blocks")}</span> to go).
          </>
        )}
        {state.phase === "live" && (
          <>
            <span className="font-medium text-foreground">NU7 is live</span> since block <span className="tabular-nums">{fmt(NU7_HEIGHT)}</span>.
            Results dated before it were tested before the upgrade.
          </>
        )}
        {state.phase === "unknown" && (
          <>
            <span className="font-medium text-foreground">Network upgrade NU7</span> activates at block{" "}
            <span className="tabular-nums">{fmt(NU7_HEIGHT)}</span>, planned for around {NU7_PLANNED_DATE}.
          </>
        )}
      </span>
      <span className="inline-flex items-center gap-1 font-medium text-accent-ink">
        {state.phase === "live" ? "What changed" : "What you need to do"}
        <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
