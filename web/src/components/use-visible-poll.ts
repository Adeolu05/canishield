"use client";

import { useEffect } from "react";

/**
 * Calls `load` now and then every `intervalMs`, but only while the tab is visible.
 * A hidden tab (another tab in front, a minimised window, a locked phone) makes no
 * requests at all; when it comes back into view it loads once right away and the
 * interval starts again. Every poll is a function run on the server, so a tab left
 * open in the background should cost nothing.
 *
 * Pass a stable `load` (useCallback): a new `load` restarts the poll and loads at
 * once, which is what a change of target (say, mainnet to testnet) should do.
 * `immediate: false` skips only the load on start (the page was just rendered);
 * coming back from hidden always loads at once, since the data may be stale by then.
 */
export function useVisiblePoll(load: () => void, intervalMs: number, { immediate = true }: { immediate?: boolean } = {}) {
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    let first = true;
    const start = () => {
      if (id !== null) return;
      if (immediate || !first) load();
      first = false;
      id = setInterval(load, intervalMs);
    };
    const stop = () => {
      if (id === null) return;
      clearInterval(id);
      id = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());

    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [load, intervalMs, immediate]);
}
