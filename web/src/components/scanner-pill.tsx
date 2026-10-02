"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useNow } from "./live";

interface Status {
  online: boolean;
  tip: number | null;
  seenAt: string | null;
}

const POLL_MS = 15_000;
const ONLINE_WITHIN_SECONDS = 90;

/** Polls the worker heartbeat for a network; liveness is recomputed every second. */
export function useScannerStatus(network: "mainnet" | "testnet") {
  const [status, setStatus] = useState<Status | null>(null);
  const now = useNow();

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/scanner-status?network=${network}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((s: Status | null) => {
          if (!cancelled) setStatus(s);
        })
        .catch(() => {
          if (!cancelled) setStatus(null);
        });
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [network]);

  const age = status?.seenAt && now !== null ? Math.max(0, Math.round((now - new Date(status.seenAt).getTime()) / 1000)) : null;
  // Recompute liveness locally so the state turns offline even between polls.
  const online = age !== null && age <= ONLINE_WITHIN_SECONDS;
  return { status, age, online, known: status !== null };
}

/** "Scanner online · block N · 12s ago", or a muted "Scanner offline". Reads the worker's heartbeat. */
export function ScannerPill() {
  const network = (usePathname() ?? "/").startsWith("/testnet") ? "testnet" : "mainnet";
  const { status, age, online } = useScannerStatus(network);
  const label = online ? "Scanner online" : "Scanner offline";
  const detail = online && status?.tip ? `block ${status.tip.toLocaleString("en-US")} · ${age}s ago` : null;
  const lastSeen = status?.seenAt ? `Last heartbeat ${new Date(status.seenAt).toUTCString()}` : "No heartbeat recorded yet";

  return (
    <span
      title={`${network === "testnet" ? "Testnet" : "Mainnet"} scanner. ${lastSeen}.`}
      className={`inline-flex h-7 min-w-7 items-center justify-center gap-2 rounded-full border px-2 text-xs sm:px-4 ${
        online ? "border-ok/30 text-foreground" : "border-line text-subtle"
      }`}
    >
      <span aria-hidden="true" className={`size-2 rounded-full ${online ? "bg-ok-solid" : "bg-line-strong"}`} />
      {/* Not a live region: the seconds tick, and screen readers should not announce every tick. */}
      <span className="sr-only">
        {network === "testnet" ? "Testnet" : "Mainnet"} {label.toLowerCase()}
        {online && status?.tip ? `, block ${status.tip.toLocaleString("en-US")}` : ""}
      </span>
      {/* Phones show only the dot; the label is in the sr-only text and the tooltip. */}
      <span aria-hidden="true" className="hidden font-medium sm:inline">
        {label}
      </span>
      {detail && (
        <span aria-hidden="true" className="hidden tabular-nums text-subtle sm:inline">
          · {detail}
        </span>
      )}
    </span>
  );
}
