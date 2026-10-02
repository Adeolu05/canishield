"use client";

// The verified moment on a test page. It animates only if this browser was
// watching the test when it flipped to verified (WatchMarker sets a flag while
// the test is live). A cold visit to an already-verified test, and anyone with
// reduced motion, sees the final state.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, BadgeCheck } from "lucide-react";
import type { Pool } from "@zecproof/db";
import { OUTCOME_VISUAL } from "@/lib/present";
import { CopyButton } from "./copy-button";
import { ShareProof } from "./share";
import { StatusLabel } from "./status";

const flagKey = (id: string) => `zp-watching-${id}`;

// True once a live test's page has run client-side in this page view. A
// receipt mounted after that is the real "status just flipped" moment; a
// receipt rendered by the server or during hydration never animates.
let watchedLive = false;

/** Marks a live test as watched in this tab, so its verification can be celebrated. */
export function WatchMarker({ testId }: { testId: string }) {
  useEffect(() => {
    watchedLive = true;
    try {
      sessionStorage.setItem(flagKey(testId), "1");
    } catch {
      // Storage blocked: the receipt just appears without animation.
    }
  }, [testId]);
  return null;
}

function useJustVerified(testId: string) {
  // Decided once, at mount. On the server and on hydration this is false.
  const [animate] = useState(() => {
    if (typeof window === "undefined" || !watchedLive) return false;
    try {
      return sessionStorage.getItem(flagKey(testId)) === "1" && !matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  });
  return animate;
}

/** Types `text` out once over ~1 s when `active`; otherwise shows it whole. */
function TypeOut({ text, active, delayMs }: { text: string; active: boolean; delayMs: number }) {
  const [shown, setShown] = useState(active ? 0 : text.length);
  const ran = useRef(false);
  useEffect(() => {
    if (!active || ran.current) return;
    ran.current = true;
    let frame = 0;
    const start = performance.now() + delayMs;
    const tick = (t: number) => {
      const n = Math.max(0, Math.min(text.length, Math.round(((t - start) / 1000) * text.length)));
      setShown(n);
      if (n < text.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, delayMs, text.length]);
  const n = active ? shown : text.length;
  return (
    <span className="hash" aria-label={text}>
      <span aria-hidden="true">{text.slice(0, n)}</span>
      {n < text.length && (
        <span aria-hidden="true" className="ml-px inline-block h-[1.1em] w-[0.5ch] translate-y-[2px] bg-accent-ink/70" />
      )}
    </span>
  );
}

export interface VerifiedReceiptProps {
  testId: string;
  serviceName: string;
  serviceHref: string;
  addressTypeLabel: string;
  pool: Pool;
  amount: string | null;
  txid: string;
  height: string;
  explorerName: string | null;
  shareUrl: string;
  shareText: string;
}

export function VerifiedReceipt(p: VerifiedReceiptProps) {
  const animate = useJustVerified(p.testId);
  const v = OUTCOME_VISUAL[p.pool];
  // Clear the flag once the receipt has been shown, so a reload shows the final state.
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        sessionStorage.removeItem(flagKey(p.testId));
      } catch {}
    }, 3000);
    return () => clearTimeout(id);
  }, [animate, p.testId]);

  /** Base classes plus, when animating, an entrance class with its delay. */
  const fx = (base: string, cls: string, delay: number) =>
    animate ? { className: `${base} ${cls}`, style: { ["--zp-delay" as string]: `${delay}ms` } } : { className: base };
  const row = "flex items-baseline justify-between gap-4 py-2";
  const label = "font-mono text-[11px] uppercase tracking-[0.14em] text-subtle";

  return (
    <section
      aria-labelledby="verified-title"
      data-animate={animate ? "true" : "false"}
      className="relative rounded-2xl border border-line bg-surface p-6 shadow-card [box-shadow:var(--shadow-card),var(--shadow-glow)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-ink">Proof receipt</p>
          <h2 id="verified-title" className="mt-2 text-xl font-semibold tracking-tight">
            Verified: landed in {v.label}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {p.serviceName} · {p.addressTypeLabel}
          </p>
        </div>
        {/* The seal. */}
        <div {...fx("shrink-0", "zp-seal", 150)} aria-hidden="true">
          <div className="grid size-16 place-items-center rounded-full border-2 border-dashed border-accent-ink/60 bg-ok-soft">
            <BadgeCheck className="size-8 text-ok" strokeWidth={2} />
          </div>
        </div>
      </div>

      <dl className="mt-6 divide-y divide-dashed divide-line-strong/60 border-y border-dashed border-line-strong/60 text-sm">
        <div className={row}>
          <dt className={label}>Txid</dt>
          <dd className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 truncate sm:whitespace-normal">
              <TypeOut text={p.txid} active={animate} delayMs={600} />
            </span>
            <CopyButton value={p.txid} label="txid" />
          </dd>
        </div>
        <div {...fx(row, "zp-fade", 1700)}>
          <dt className={label}>Landed in</dt>
          <dd>
            <StatusLabel icon={v.icon} tone={v.tone} label={v.label} />
          </dd>
        </div>
        <div {...fx(row, "zp-fade", 1850)}>
          <dt className={label}>Block</dt>
          <dd className="font-mono text-xs tabular-nums">{p.height}</dd>
        </div>
        {p.amount && (
          <div {...fx(row, "zp-fade", 1950)}>
            <dt className={label}>Amount</dt>
            <dd className="font-mono text-xs tabular-nums">{p.amount}</dd>
          </div>
        )}
      </dl>

      <div {...fx("mt-4 flex flex-wrap items-center justify-between gap-2 text-xs", "zp-fade", 2100)}>
        <span className="inline-flex items-center gap-1 text-ok">
          <BadgeCheck aria-hidden="true" className="size-4" />
          {p.explorerName ? `Confirmed on ${p.explorerName}` : "Verified on-chain"}
        </span>
        <Link href={p.serviceHref} className="inline-flex items-center gap-1 font-medium text-accent-ink underline-offset-4 hover:underline">
          See it on {p.serviceName}&apos;s evidence page <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </div>
      <div className="mt-4 border-t border-dashed border-line-strong/60 pt-4">
        <ShareProof url={p.shareUrl} text={p.shareText} />
      </div>
    </section>
  );
}
