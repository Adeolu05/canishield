"use client";

import { useScannerStatus } from "./scanner-pill";

/** "scanner live" / "scanner offline" for inline text, from the same heartbeat as the header pill. */
export function ScannerWord({ network }: { network: "mainnet" | "testnet" }) {
  const { online, known } = useScannerStatus(network);
  if (!known) return <span>scanner status…</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${online ? "bg-ok-solid" : "bg-line-strong"}`} />
      {online ? "scanner live" : "scanner offline"}
    </span>
  );
}
