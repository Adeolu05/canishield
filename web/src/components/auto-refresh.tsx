"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useVisiblePoll } from "./use-visible-poll";

/** Re-renders the page's server components on an interval while mounted and the tab is visible. */
export function AutoRefresh({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);
  useVisiblePoll(refresh, intervalMs, { immediate: false });
  return null;
}
