// What the header pill and the board say about the scanner worker. Pure, so it
// can be unit tested. "checking" until a real answer arrives: the server HTML
// and the first paint must never claim the scanner is offline.

/** The worker polls every 30 s; two missed cycles means offline. Same as /api/scanner-status. */
export const ONLINE_WITHIN_SECONDS = 90;

export type ScannerState = "checking" | "online" | "offline";

/** One answer from /api/scanner-status, plus when this tab received it (ms). */
export interface ScannerAnswer {
  online: boolean;
  tip: number | null;
  seenAt: string | null;
  ageSeconds: number | null;
  receivedAt: number;
}

export const SCANNER_LABEL: Record<ScannerState, string> = {
  checking: "Checking scanner",
  online: "Scanner online",
  offline: "Scanner offline",
};

/**
 * The heartbeat's age right now. Counted from the server's own ageSeconds plus
 * the time since this tab got the answer, so a visitor whose clock is off
 * doesn't see a live scanner as offline (or a dead one as online).
 */
export function heartbeatAge(answer: ScannerAnswer, now: number | null): number | null {
  const since = now === null ? 0 : Math.max(0, Math.round((now - answer.receivedAt) / 1000));
  if (typeof answer.ageSeconds === "number" && Number.isFinite(answer.ageSeconds)) return Math.max(0, answer.ageSeconds) + since;
  if (!answer.seenAt || now === null) return null;
  const seen = new Date(answer.seenAt).getTime();
  return Number.isFinite(seen) ? Math.max(0, Math.round((now - seen) / 1000)) : null;
}

export function scannerState(answer: ScannerAnswer | null, now: number | null): { state: ScannerState; age: number | null } {
  if (!answer) return { state: "checking", age: null };
  const age = heartbeatAge(answer, now);
  // A real answer with no heartbeat at all is offline; so is one older than 90 s.
  return { state: age !== null && age <= ONLINE_WITHIN_SECONDS ? "online" : "offline", age };
}

/** Reads a /api/scanner-status body; null for anything that isn't one (not a real answer). */
export function parseScannerAnswer(body: unknown, receivedAt: number): ScannerAnswer | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.online !== "boolean") return null;
  return {
    online: b.online,
    tip: typeof b.tip === "number" && Number.isFinite(b.tip) ? b.tip : null,
    seenAt: typeof b.seenAt === "string" ? b.seenAt : null,
    ageSeconds: typeof b.ageSeconds === "number" && Number.isFinite(b.ageSeconds) ? b.ageSeconds : null,
    receivedAt,
  };
}
