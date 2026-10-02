"use client";

import { useSyncExternalStore } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

// A shared one-second clock. The server snapshot is null, so the server renders
// a stable placeholder and the live value appears after hydration.
const subscribeToClock = (tick: () => void) => {
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
};
export const useNow = () =>
  useSyncExternalStore(
    subscribeToClock,
    () => Math.floor(Date.now() / 1000) * 1000,
    () => null,
  );

/** "Expires in 47 h 12 min" → "Expires in 12:05" in the last hour → "Expired". */
export function Countdown({ until }: { until: string }) {
  const target = new Date(until).getTime();
  const now = useNow();
  if (now === null) return <span className="tabular-nums">…</span>;
  const s = Math.max(0, Math.floor((target - now) / 1000));
  if (s === 0) return <span className="tabular-nums">Expired</span>;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const text = h >= 1 ? `${h} h ${pad(m)} min` : `${pad(m)}:${pad(s % 60)}`;
  return (
    <time dateTime={until} className="tabular-nums">
      {text}
    </time>
  );
}

/** Small "Live" indicator shown while the page polls for status. */
export function LiveDot({ intervalSeconds }: { intervalSeconds: number }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-subtle">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok-solid opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-ok-solid" />
      </span>
      Live · checks every {intervalSeconds} s
    </span>
  );
}

const ago = (seconds: number) =>
  seconds < 60 ? `${seconds}s ago` : seconds < 3600 ? `${Math.floor(seconds / 60)} min ago` : seconds < 86_400 ? `${Math.floor(seconds / 3600)} h ago` : `${Math.floor(seconds / 86_400)} d ago`;

/** "12s ago" / "3 h ago", ticking. Renders `fallback` (e.g. an absolute date) on the server. */
export function RelativeTime({ iso, fallback }: { iso: string; fallback: string }) {
  const now = useNow();
  const text = now === null ? fallback : ago(Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000)));
  return (
    <time dateTime={iso} title={new Date(iso).toUTCString()} className="tabular-nums">
      {text}
    </time>
  );
}
