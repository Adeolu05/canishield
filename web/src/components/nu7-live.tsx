"use client";

// The live parts of the NU7 page: one poll of /api/nu7 shared by the countdown,
// the chain strip and the activation record. Everything shown comes from our
// mainnet scanner; the only estimate is the activation time, and it says so.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CalendarPlus, CircleCheck, TriangleAlert } from "lucide-react";
import { useNow } from "./live";
import { NU7_HEIGHT, NU7_PLANNED_DATE, POST_NU7_SPACING_S, PRE_NU7_SPACING_S, clockParts, formatRemaining, nu7State, type Nu7State } from "@/lib/nu7";
import type { Nu7Snapshot } from "@/lib/nu7-data";

const POLL_MS = 10_000;
const ONLINE_WITHIN_MS = 90_000;
const FINAL_APPROACH = 100;

const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many: string) => `${fmt(n)} ${n === 1 ? one : many}`;
const secs = (s: number) => `${s.toFixed(1)} s`;

interface Live {
  snap: Nu7Snapshot;
  state: Nu7State;
  now: number | null;
  /** Until the estimate; before hydration, the blocks left at the measured spacing. */
  remainingMs: number;
  overdue: boolean;
  /** A poll has answered and the scanner's heartbeat is older than 90 s. */
  stale: boolean;
}

const Nu7Context = createContext<Live | null>(null);

/** Better of two snapshots: the higher tip wins; a failed or older poll never moves the page backwards. */
function newer(a: Nu7Snapshot, b: Nu7Snapshot): Nu7Snapshot {
  if ((b.tip ?? 0) > (a.tip ?? 0)) return b;
  if ((b.tip ?? 0) === (a.tip ?? 0) && b.seenAt && b.seenAt !== a.seenAt) return b; // same tip, fresher heartbeat
  return a;
}

export function Nu7Provider({ initial, children }: { initial: Nu7Snapshot; children: ReactNode }) {
  const [snap, setSnap] = useState(initial);
  const [polled, setPolled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/nu7", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<Nu7Snapshot>) : null))
        .then((s) => {
          if (cancelled || !s) return;
          setPolled(true);
          setSnap((cur) => newer(cur, s));
        })
        .catch(() => {});
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const now = useNow();
  const state = nu7State(snap.tip, null, NU7_HEIGHT, snap.spacingS);
  const etaMs = snap.etaMs;
  const remainingMs =
    state.phase === "upcoming" ? (now === null || etaMs === null ? state.blocksLeft * snap.spacingS * 1000 : etaMs - now) : 0;
  const overdue = state.phase === "upcoming" && now !== null && remainingMs <= 0;
  const stale = polled && now !== null && (!snap.seenAt || now - new Date(snap.seenAt).getTime() > ONLINE_WITHIN_MS);
  return <Nu7Context.Provider value={{ snap, state, now, remainingMs, overdue, stale }}>{children}</Nu7Context.Provider>;
}

export function useNu7(): Live {
  const v = useContext(Nu7Context);
  if (!v) throw new Error("useNu7 outside Nu7Provider");
  return v;
}

/** A number whose digits roll to their new value. Commas stay put. */
function Odometer({ value, className = "" }: { value: number; className?: string }) {
  const chars = fmt(value).split("");
  return (
    <span className={`inline-flex tabular-nums ${className}`} aria-label={fmt(value)} role="img">
      {chars.map((c, i) => {
        // Key by position from the right, so the ones digit stays the same element as the number shrinks.
        const key = chars.length - i;
        if (c === ",") return <span key={`c${key}`}>,</span>;
        const d = Number(c);
        return (
          <span key={key} aria-hidden="true" className="relative inline-block h-[1em] w-[0.62em] overflow-hidden">
            <span className="absolute inset-x-0 top-0 flex flex-col transition-transform duration-700 ease-out" style={{ transform: `translateY(-${d}em)` }}>
              {Array.from({ length: 10 }, (_, n) => (
                <span key={n} className="block h-[1em] leading-none">
                  {n}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}

const ETA_PARTS = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" } as const;
const LOCAL_ETA = new Intl.DateTimeFormat(undefined, ETA_PARTS);
const UTC_ETA = new Intl.DateTimeFormat("en-GB", { ...ETA_PARTS, timeZone: "UTC" });
const pad = (n: number) => String(n).padStart(2, "0");

function Clock({ ms, ready }: { ms: number; ready: boolean }) {
  const p = clockParts(ms);
  const cells: [string, string][] = [
    [String(p.d), "days"],
    [pad(p.h), "hours"],
    [pad(p.m), "min"],
    [pad(p.s), "sec"],
  ];
  return (
    <div className="grid grid-cols-4 gap-2" role="timer" aria-live="off" aria-label={ready ? `About ${formatRemaining(ms)} to go` : "Countdown loading"}>
      {cells.map(([v, label]) => (
        <div key={label} className="rounded-xl border border-line bg-surface-2 px-1 py-3 text-center">
          <div className="font-mono text-3xl font-semibold leading-none tabular-nums sm:text-4xl">{ready ? v : "··"}</div>
          <div className="mt-2 text-[11px] uppercase tracking-[0.14em] text-subtle">{label}</div>
        </div>
      ))}
    </div>
  );
}

/** The big card at the top of /nu7. */
export function Nu7Countdown() {
  const { snap, state, now, remainingMs, overdue, stale } = useNu7();
  const label = "font-mono text-[11px] uppercase tracking-[0.14em] text-subtle";
  const final = state.phase === "upcoming" && state.blocksLeft <= FINAL_APPROACH;
  return (
    <aside
      aria-labelledby="nu7-countdown"
      className={`rounded-2xl border bg-surface p-6 shadow-card sm:p-8 [box-shadow:var(--shadow-card),var(--shadow-glow)] ${final ? "border-accent" : "border-line"}`}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="nu7-countdown" className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-ink">
          {state.phase === "live" ? "Upgrade status" : final ? "Final approach" : "Countdown"}
        </h2>
        {state.phase !== "unknown" && !stale && (
          <span className="inline-flex items-center gap-2 text-xs text-subtle">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok-solid opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-ok-solid" />
            </span>
            Live from our scanner
          </span>
        )}
      </div>

      {state.phase === "upcoming" && (
        <>
          <p className="mt-6 text-6xl font-semibold leading-none tracking-tight sm:text-7xl">
            <Odometer value={state.blocksLeft} />
          </p>
          <p className="mt-2 text-sm text-muted">{state.blocksLeft === 1 ? "block" : "blocks"} to go</p>
          {final && (
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${FINAL_APPROACH - state.blocksLeft} of the last ${FINAL_APPROACH} blocks mined`}>
              <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${((FINAL_APPROACH - state.blocksLeft) / FINAL_APPROACH) * 100}%` }} />
            </div>
          )}
          <div className="mt-6">{overdue ? <p className="text-2xl font-semibold">Any moment now</p> : <Clock ms={remainingMs} ready={now !== null} />}</div>
          <p className="mt-4 min-h-10 text-sm text-muted">
            {now !== null && !overdue && snap.etaMs !== null && (
              <>
                Expected around{" "}
                <time dateTime={new Date(snap.etaMs).toISOString()} className="font-medium text-foreground tabular-nums">
                  {LOCAL_ETA.format(snap.etaMs)}
                </time>{" "}
                your time <span className="whitespace-nowrap text-subtle">({UTC_ETA.format(snap.etaMs)} UTC)</span>
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
          <dt className={label}>{state.phase === "live" ? "Block time" : "Recent pace"}</dt>
          <dd className="text-xs">
            {state.phase === "live"
              ? `${POST_NU7_SPACING_S} s target (was ${PRE_NU7_SPACING_S} s)`
              : snap.pace
                ? `${secs(snap.pace.seconds)} per block (last ${snap.pace.intervals})`
                : `${PRE_NU7_SPACING_S} s target`}
          </dd>
        </div>
      </dl>
      {state.phase === "upcoming" && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-xs text-subtle">An estimate from the recent pace. The block height is what&apos;s fixed.</p>
          <a href="/nu7/calendar" className="inline-flex items-center gap-1 text-xs font-medium text-accent-ink underline-offset-4 hover:underline">
            <CalendarPlus aria-hidden="true" className="size-3.5" /> Add to calendar
          </a>
        </div>
      )}
    </aside>
  );
}

/** Watches the container's width, so the strip can pick its time window and hide labels that wouldn't fit. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const ago = (s: number) => (s < 90 ? `${s} s ago` : `${Math.round(s / 60)} min ago`);

/** The last 40 minutes of the chain (15 on phones), drifting left as time passes. Squares are real blocks at their header times. */
export function ChainStrip() {
  const { snap, now, state } = useNu7();
  const [ref, width] = useWidth<HTMLDivElement>();
  const windowMin = width && width < 640 ? 15 : 40;
  const windowMs = windowMin * 60_000;
  const blocks = snap.blocks;
  const latest = blocks.at(-1);
  const ready = now !== null && width > 0;
  const left = (now ?? 0) - windowMs;
  const x = (t: number) => Math.min(100, Math.max(0, ((t - left) / windowMs) * 100));
  const visible = ready ? blocks.filter((b) => b.t >= left - 120_000) : [];
  const since = latest && now !== null ? Math.max(0, Math.round((now - latest.t) / 1000)) : null;
  const actTime = snap.activation?.time;
  const afterPace = snap.activation?.after;

  return (
    <section aria-labelledby="chain-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-ink">Watch it happen</p>
          <h2 id="chain-title" className="mt-2 text-2xl font-semibold tracking-tight">
            The Zcash chain, live
          </h2>
        </div>
        <p className="text-xs text-subtle">
          Last {windowMin} minutes. Each square is a real block, placed at its timestamp.{" "}
          {state.phase === "live" ? "Gold squares are NU7 blocks." : "After NU7 they should come three times as often."}
        </p>
      </div>

      <div ref={ref} className="relative h-40 overflow-hidden rounded-2xl border border-line bg-surface" role="img" aria-label={latest ? `Recent Zcash blocks. Latest block ${fmt(latest.h)}${since !== null ? `, ${ago(since)}` : ""}.` : "Recent Zcash blocks"}>
        <div aria-hidden="true" className="zp-dots absolute inset-0 opacity-60" />
        {/* the "now" edge: where the next block will appear */}
        <div aria-hidden="true" className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-accent/10 to-transparent" />
        <div aria-hidden="true" className="absolute inset-x-0 top-[72px] h-px bg-line" />
        {/* time axis */}
        {ready &&
          Array.from({ length: windowMin / (windowMin > 20 ? 10 : 5) + 1 }, (_, i) => {
            const step = windowMin > 20 ? 10 : 5;
            const m = windowMin - i * step;
            return (
              <span
                key={m}
                aria-hidden="true"
                className={`absolute bottom-2 whitespace-nowrap font-mono text-[10px] text-subtle ${i === 0 ? "pl-3" : m === 0 ? "-translate-x-full pr-3" : "-translate-x-1/2"}`}
                style={{ left: `${((windowMin - m) / windowMin) * 100}%` }}
              >
                {m === 0 ? "now" : `-${m} min`}
              </span>
            );
          })}
        {ready && actTime && actTime >= left && (
          <div aria-hidden="true" className="absolute inset-y-3 w-0.5 bg-accent shadow-[0_0_16px_2px_rgb(244_183_40/0.5)]" style={{ left: `${x(actTime)}%` }}>
            <span className="absolute -top-0.5 left-1.5 whitespace-nowrap rounded bg-accent px-1.5 font-mono text-[10px] font-semibold text-[#18181b]">NU7</span>
          </div>
        )}
        {visible.map((b, i) => {
          const prev = i > 0 ? visible[i - 1] : blocks[blocks.indexOf(b) - 1];
          const gap = prev ? Math.round((b.t - prev.t) / 1000) : null;
          const after = b.h >= NU7_HEIGHT;
          const isLatest = b.h === latest?.h;
          return (
            <div key={b.h} className="absolute top-[72px] transition-[left] duration-1000 ease-linear" style={{ left: `${x(b.t)}%` }}>
              <span aria-hidden="true" className="absolute block -translate-x-1/2 -translate-y-1/2" title={`Block ${fmt(b.h)}${gap !== null ? `, ${Math.max(0, gap)} s after the one before` : ""}`}>
                <span
                  className={`zp-pop block rounded-[3px] border-2 ${after ? "size-2.5 border-accent bg-accent/30" : "size-3 border-line-strong bg-surface-2"} ${
                    isLatest ? "ring-4 ring-accent/30" : ""
                  }`}
                />
              </span>
              {isLatest && (
                <span className="absolute top-4 -translate-x-full whitespace-nowrap pr-1 font-mono text-[11px] font-medium tabular-nums text-foreground">
                  #{fmt(b.h)}
                  {gap !== null && <span className="text-subtle"> · {Math.max(0, gap)} s after the last</span>}
                </span>
              )}
            </div>
          );
        })}
        {ready && latest && (
          <div aria-hidden="true" className="absolute right-3 top-3 flex items-center gap-2 font-mono text-[11px] text-subtle">
            <span className="size-2.5 animate-pulse rounded-[3px] border border-dashed border-accent" />
            waiting for #{fmt(latest.h + 1)}
            {since !== null && <span className="tabular-nums">· {since} s</span>}
          </div>
        )}
        {(!ready || blocks.length === 0) && (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted">
            {blocks.length === 0 ? "The live chain view appears once our scanner has recorded a few blocks." : "Loading the chain…"}
          </p>
        )}
      </div>

      <dl className="grid gap-4 text-sm sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <dt className="text-xs text-subtle">Latest block</dt>
          <dd className="mt-1 font-medium tabular-nums">
            {latest ? (
              <>
                #{fmt(latest.h)} <span className="text-muted">{since !== null ? `· ${ago(since)}` : ""}</span>
              </>
            ) : (
              "…"
            )}
          </dd>
        </div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <dt className="text-xs text-subtle">{afterPace ? "Average gap since NU7" : "Average gap, last 100 blocks"}</dt>
          <dd className="mt-1 font-medium tabular-nums">
            {afterPace ? `${secs(afterPace.seconds)} (${plural(afterPace.intervals, "gap", "gaps")})` : snap.pace ? secs(snap.pace.seconds) : "…"}
          </dd>
        </div>
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
          <dt className="text-xs text-subtle">Target</dt>
          <dd className="mt-1 font-medium">
            {state.phase === "live" ? `${POST_NU7_SPACING_S} s (was ${PRE_NU7_SPACING_S} s)` : `${PRE_NU7_SPACING_S} s now, ${POST_NU7_SPACING_S} s after NU7`}
          </dd>
        </div>
      </dl>
    </section>
  );
}

const LONG = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const LONG_UTC = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" });

/** Appears once block 3,543,405 is recorded: when it landed and what the first NU7 blocks looked like. */
export function ActivationRecord() {
  const { snap, now } = useNu7();
  const a = snap.activation;
  if (!a) return null;
  const gaps = a.firstBlocks.slice(1).map((b, i) => ({ h: b.h, s: Math.max(0, Math.round((b.t - a.firstBlocks[i].t) / 1000)) }));
  const max = Math.max(PRE_NU7_SPACING_S, ...gaps.map((g) => g.s));
  return (
    <section aria-labelledby="activation-title" className="rounded-2xl border border-accent bg-surface p-6 sm:p-8">
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-ink">On the record</p>
      <h2 id="activation-title" className="mt-2 text-2xl font-semibold tracking-tight">
        NU7 activated at block {fmt(NU7_HEIGHT)}
      </h2>
      <p className="mt-2 text-muted">
        {now !== null ? (
          <>
            The block&apos;s timestamp: <span className="font-medium text-foreground">{LONG.format(a.time)}</span> your time ({LONG_UTC.format(a.time)} UTC).
          </>
        ) : (
          <>The block&apos;s timestamp: {new Date(a.time).toUTCString()}.</>
        )}{" "}
        {a.after && <>The blocks since have averaged {secs(a.after.seconds)} apart.</>}
      </p>
      {gaps.length > 0 && (
        <div className="mt-6">
          <p className="text-xs text-subtle">Gap before each of the first NU7 blocks, in seconds (the line marks the old 75 s target)</p>
          <div className="relative mt-3 flex h-28 items-end gap-1.5">
            <div aria-hidden="true" className="absolute inset-x-0 border-t border-dashed border-line-strong" style={{ bottom: `${(PRE_NU7_SPACING_S / max) * 88}px` }} />
            {gaps.map((g) => (
              <div key={g.h} className="flex flex-1 flex-col items-center justify-end gap-1" title={`Block ${fmt(g.h)}: ${g.s} s`}>
                <span className="font-mono text-[10px] tabular-nums text-subtle">{g.s}</span>
                <div className="w-full rounded-t bg-accent" style={{ height: `${Math.max(4, (g.s / max) * 88)}px` }} />
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-4 text-xs text-subtle">Header times as recorded by our mainnet scanner. Miners set them, so single gaps can look odd; the average is the useful number.</p>
    </section>
  );
}

/** One line above the home hero. Its own provider, so the home page polls the same live data. */
export function Nu7Strip({ initial }: { initial: Nu7Snapshot }) {
  return (
    <Nu7Provider initial={initial}>
      <StripInner />
    </Nu7Provider>
  );
}

function StripInner() {
  const { state, remainingMs, overdue } = useNu7();
  return (
    <Link
      href="/nu7"
      className="group flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-accent/40 bg-surface px-4 py-3 text-sm transition-colors duration-150 hover:border-accent"
    >
      <span className="inline-flex h-6 items-center rounded-full bg-accent px-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#18181b]">NU7</span>
      <span className="min-w-0 flex-1 text-muted">
        {state.phase === "upcoming" && (
          <>
            <span className="font-medium text-foreground">{overdue ? "Network upgrade any moment now" : `Network upgrade in about ${formatRemaining(remainingMs)}`}</span>
            , at block <span className="tabular-nums">{fmt(NU7_HEIGHT)}</span> (<span className="tabular-nums">{plural(state.blocksLeft, "block", "blocks")}</span> to go).
          </>
        )}
        {state.phase === "live" && (
          <>
            <span className="font-medium text-foreground">NU7 is live</span> since block <span className="tabular-nums">{fmt(NU7_HEIGHT)}</span>. Results
            dated before it were tested before the upgrade.
          </>
        )}
        {state.phase === "unknown" && (
          <>
            <span className="font-medium text-foreground">Network upgrade NU7</span> activates at block <span className="tabular-nums">{fmt(NU7_HEIGHT)}</span>,
            planned for around {NU7_PLANNED_DATE}.
          </>
        )}
      </span>
      <span className="inline-flex items-center gap-1 font-medium text-accent-ink">
        {state.phase === "live" ? "What changed" : "Watch it live"}
        <ArrowRight aria-hidden="true" className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
