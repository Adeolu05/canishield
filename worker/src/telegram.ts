// Optional Telegram alerts for confirmed ZEC deposit/withdrawal changes.
// Off unless both TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set. The token
// is only ever put in the request URL: never logged, never in an error message.
import { and, asc, eq, gt, isNull, lte } from "drizzle-orm";
import { fundingEvents, services, type Db } from "@zecproof/db";
import type { Fetch } from "./explorer";

const SITE = "https://canishield.vercel.app";
/** Changes older than this when alerts get turned on are marked done, not sent: no flood of stale news. */
const FRESH_MS = 6 * 3600_000;
const PER_RUN = 10;
const TIMEOUT_MS = 8_000;

const TOKEN_RE = /^\d{5,15}:[A-Za-z0-9_-]{30,64}$/;
const CHAT_RE = /^(@[A-Za-z][A-Za-z0-9_]{4,31}|-?\d{5,20})$/;

let warned = false;

export function telegramConfig(env: Record<string, string | undefined>): { token: string; chat: string } | null {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chat = env.TELEGRAM_CHAT_ID?.trim();
  if (!token && !chat) return null;
  if (!token || !chat || !TOKEN_RE.test(token) || !CHAT_RE.test(chat)) {
    if (!warned) console.warn("telegram  TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID missing or malformed: alerts are off");
    warned = true;
    return null;
  }
  return { token, chat };
}

export function alertText(e: { name: string; slug: string; side: string; fromState: string; toState: string; at: Date }): string {
  const what = e.side === "deposit" ? "deposits" : "withdrawals";
  const verb = e.toState === "paused" ? "paused" : "reopened";
  const hhmm = e.at.toISOString().slice(11, 16);
  return [
    `${e.name}: ZEC ${what} ${verb}.`,
    `Seen at ${hhmm} UTC on ${e.name}'s public API.`,
    `Open or paused is about ZEC in general, not shielded support. Full record: ${SITE}/services/${e.slug}`,
  ].join("\n");
}

export async function notifyEvents(db: Db, env: Record<string, string | undefined>, fetchFn: Fetch, now: Date) {
  const cfg = telegramConfig(env);
  if (!cfg) return;
  try {
    const fresh = new Date(now.getTime() - FRESH_MS);
    await db
      .update(fundingEvents)
      .set({ notifiedAt: now })
      .where(and(isNull(fundingEvents.notifiedAt), lte(fundingEvents.at, fresh)));

    const pending = await db
      .select({
        id: fundingEvents.id,
        side: fundingEvents.side,
        fromState: fundingEvents.fromState,
        toState: fundingEvents.toState,
        at: fundingEvents.at,
        name: services.name,
        slug: services.slug,
      })
      .from(fundingEvents)
      .innerJoin(services, eq(services.id, fundingEvents.serviceId))
      .where(and(isNull(fundingEvents.notifiedAt), gt(fundingEvents.at, fresh)))
      .orderBy(asc(fundingEvents.at))
      .limit(PER_RUN);

    for (const e of pending) {
      const sent = await send(cfg, alertText(e), fetchFn);
      if (!sent.ok) {
        console.error(`telegram  send failed (${sent.reason}); will retry next run`);
        break; // keep the order: try again later rather than skip ahead
      }
      await db.update(fundingEvents).set({ notifiedAt: new Date() }).where(eq(fundingEvents.id, e.id));
      console.log(`telegram  sent: ${e.slug} ${e.side} ${e.fromState} -> ${e.toState}`);
    }
  } catch (err) {
    console.error(`telegram  step failed: ${err instanceof Error ? err.message.slice(0, 120) : "error"}`);
  }
}

async function send(cfg: { token: string; chat: string }, text: string, fetchFn: Fetch): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const res = await (fetchFn as (u: string, i: RequestInit) => Promise<Response>)(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chat, text, link_preview_options: { is_disabled: true } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? { ok: true } : { ok: false, reason: `HTTP ${res.status}` };
  } catch (err) {
    // Deliberately no err.message: it could carry the request URL, which holds the token.
    return { ok: false, reason: err instanceof Error && err.name === "TimeoutError" ? "timed out" : "request failed" };
  }
}
