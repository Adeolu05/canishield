"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useNow } from "./live";
import { SCANNER_LABEL, parseScannerAnswer, scannerState, type ScannerAnswer } from "@/lib/scanner-state";
import { useVisiblePoll } from "./use-visible-poll";

// The worker writes its heartbeat every 30 s, so polling faster than that only
// re-reads the same row. The pill is in the header of every page, so this poll
// runs for every open tab on the site.
const POLL_MS = 30_000;

/**
 * Polls the worker heartbeat for a network while the tab is visible; liveness is
 * recomputed every second. state is "checking" until a real answer arrives, so
 * the server HTML and the first paint never say "offline".
 */
export function useScannerStatus(network: "mainnet" | "testnet") {
  // Each answer remembers its network, so switching between mainnet and testnet
  // pages shows "checking" again instead of the other network's answer.
  const [kept, setKept] = useState<{ network: string; answer: ScannerAnswer } | null>(null);
  const answer = kept?.network === network ? kept.answer : null;
  const now = useNow();

  // Drop answers that arrive after the path has switched networks.
  const current = useRef(network);
  useEffect(() => {
    current.current = network;
  }, [network]);

  const load = useCallback(() => {
    fetch(`/api/scanner-status?network=${network}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: unknown) => {
        const a = parseScannerAnswer(body, Date.now());
        // A failed or malformed reply is not an answer: keep the last real one, whose age keeps counting.
        if (a && current.current === network) setKept({ network, answer: a });
      })
      .catch(() => {});
  }, [network]);
  useVisiblePoll(load, POLL_MS);

  const { state, age } = scannerState(answer, now);
  return { status: answer, age, state, online: state === "online", known: state !== "checking" };
}

/** "Scanner online · block N · 12s ago", a muted "Scanner offline", or "Checking scanner" before the first answer. */
export function ScannerPill() {
  const network = (usePathname() ?? "/").startsWith("/testnet") ? "testnet" : "mainnet";
  const { status, age, state } = useScannerStatus(network);
  const online = state === "online";
  const label = SCANNER_LABEL[state];
  const detail = online && status?.tip ? `block ${status.tip.toLocaleString("en-US")} · ${age}s ago` : null;
  const lastSeen =
    state === "checking"
      ? "Checking the heartbeat"
      : status?.seenAt
        ? `Last heartbeat ${new Date(status.seenAt).toUTCString()}`
        : "No heartbeat recorded yet";

  return (
    <span
      title={`${network === "testnet" ? "Testnet" : "Mainnet"} scanner. ${lastSeen}.`}
      data-state={state}
      className={`inline-flex h-7 min-w-7 items-center justify-center gap-2 whitespace-nowrap rounded-full border px-2 text-xs sm:px-4 ${
        online ? "border-ok/30 text-foreground" : "border-line text-subtle"
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${online ? "bg-ok-solid" : state === "checking" ? "animate-pulse bg-line motion-reduce:animate-none" : "bg-line-strong"}`}
      />
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
        <span aria-hidden="true" className="hidden tabular-nums text-subtle lg:inline">
          · {detail}
        </span>
      )}
    </span>
  );
}
