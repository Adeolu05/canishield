"use client";

import { useScannerStatus } from "./scanner-pill";

/** "scanner live" / "scanner offline" / "checking scanner" for inline text, from the same heartbeat as the header pill. */
export function ScannerWord({ network }: { network: "mainnet" | "testnet" }) {
  const { online, known } = useScannerStatus(network);
  if (!known)
    return (
      <span className="inline-flex items-center gap-1" data-state="checking">
        <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-line motion-reduce:animate-none" />
        checking scanner
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1" data-state={online ? "online" : "offline"}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${online ? "bg-ok-solid" : "bg-line-strong"}`} />
      {online ? "scanner live" : "scanner offline"}
    </span>
  );
}
