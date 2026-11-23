"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Radio } from "lucide-react";

interface StatusExchange {
  name?: string;
  fresh?: boolean;
  deposits?: string;
  withdrawals?: string;
}

/** The homepage's live line. Fetched in the browser so a cached page does not freeze a pause. */
export function LivePausedLink() {
  const [paused, setPaused] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/status.json")
      .then((r) => (r.ok ? (r.json() as Promise<{ exchanges?: StatusExchange[] }>) : null))
      .then((data) => {
        if (cancelled || !data?.exchanges) return;
        setPaused(
          data.exchanges
            .filter((e) => e.fresh && e.name && (e.deposits === "paused" || e.withdrawals === "paused"))
            .map((e) => e.name!),
        );
      })
      .catch(() => {
        if (!cancelled) setPaused([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const names = paused ?? [];
  const urgent = names.length > 0;
  return (
    <Link
      href="/status"
      className={`inline-flex items-center gap-1.5 text-xs font-medium underline-offset-4 hover:underline ${urgent ? "text-bad" : "text-accent-ink"}`}
    >
      <Radio aria-hidden="true" className="size-3.5" />
      {urgent ? `ZEC paused right now on ${names.join(", ")}: live status` : "Can I move ZEC right now? Live exchange status"}
      <ArrowRight aria-hidden="true" className="size-3.5" />
    </Link>
  );
}
