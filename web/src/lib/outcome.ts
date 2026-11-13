// Exit outcome reports (Phase 1 of the Exit Outcomes plan): what a service did
// with ZEC that came out of the shielded pool, as told by the person who sent it.
// Pure helpers, no request or database access, so they can be unit tested.
//
// Privacy is the point: only an amount range, the week (its Monday) and the route
// are kept. No address, txid, exact amount or exact date, so a report can't be
// matched to a transaction. Notes that look like they hold one are refused.
import type { AmountBand, OutcomeResult, OutcomeRoute } from "@zecproof/db";
import { isPlainText } from "./deposit-core";

export const OUTCOME_RESULTS = ["credited", "held_then_credited", "documents_requested", "rejected", "refunded", "held_open"] as const satisfies readonly OutcomeResult[];
export const AMOUNT_BANDS = ["under_1", "1_to_10", "10_to_100", "over_100", "unknown"] as const satisfies readonly AmountBand[];
export const OUTCOME_ROUTES = ["direct_shielded", "via_tex", "via_transparent", "swap", "unknown"] as const satisfies readonly OutcomeRoute[];

export const OUTCOME_RESULT_LABEL: Record<OutcomeResult, { title: string; hint: string }> = {
  credited: { title: "Credited", hint: "It arrived in my account." },
  held_then_credited: { title: "Held, then credited", hint: "Paused for review, released later." },
  documents_requested: { title: "Asked for documents", hint: "They asked for source of funds or ID." },
  rejected: { title: "Refused", hint: "They refused it; a return is promised but hasn't arrived." },
  refunded: { title: "Refunded", hint: "They sent it back." },
  held_open: { title: "Held, still open", hint: "Not credited, not returned." },
};

export const AMOUNT_BAND_LABEL: Record<AmountBand, string> = {
  under_1: "Under 1 ZEC",
  "1_to_10": "1 to 10 ZEC",
  "10_to_100": "10 to 100 ZEC",
  over_100: "Over 100 ZEC",
  unknown: "Prefer not to say",
};

export const OUTCOME_ROUTE_LABEL: Record<OutcomeRoute, { title: string; hint: string }> = {
  direct_shielded: { title: "Straight from a shielded address", hint: "Sent from Zodl, Zingo, Ywallet and the like." },
  via_tex: { title: "Through a TEX address", hint: "The service's tex1 address." },
  via_transparent: { title: "Unshielded first", hint: "To my own t-address, then on to the service." },
  swap: { title: "A swap or bridge", hint: "For example NEAR Intents." },
  unknown: { title: "Not sure", hint: "" },
};

/** Results that need "days held". */
export const HELD_RESULTS: readonly OutcomeResult[] = ["held_then_credited", "held_open"];

/** One report per browser per service in this many days. */
export const OUTCOME_COOLDOWN_DAYS = 30;
/** New reports per hour across everyone; a backstop for when cookies are cleared. */
export const OUTCOME_MAX_PER_HOUR = 20;
/** The first day there was ZEC to send (mainnet launch). */
const ZCASH_LAUNCH = Date.UTC(2016, 9, 28);
const DAY = 86_400_000;

export type OutcomeInput = {
  serviceId: string;
  result: OutcomeResult;
  amountBand: AmountBand;
  route: OutcomeRoute;
  weekOf: string; // YYYY-MM-DD, a Monday
  daysHeld: number | null;
  creditMinutes: number | null;
  evidenceUrl: string | null;
  note: string | null;
};

/** The Monday (UTC) of the week a YYYY-MM-DD date falls in, as YYYY-MM-DD; null if the date isn't real. */
export function mondayOf(day: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const t = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== day) return null; // rejects 2026-02-30
  const isoDow = new Date(t).getUTCDay() || 7; // Monday 1 ... Sunday 7
  return new Date(t - (isoDow - 1) * DAY).toISOString().slice(0, 10);
}

/** Things that could tie a note to a transaction or a person. */
const IDENTIFYING: { re: RegExp; what: string }[] = [
  { re: /\b[0-9a-f]{64}\b/i, what: "a transaction ID" },
  { re: /\b(?:t1|t3|tm)[1-9A-HJ-NP-Za-km-z]{25,}/, what: "an address" },
  { re: /\b(?:u1|utest1|zs1|ztestsapling1|tex1|textest1)[0-9a-z]{20,}/i, what: "an address" },
  { re: /\b0x[0-9a-f]{40}\b/i, what: "an address" },
  { re: /[^\s@]+@[^\s@]+\.[a-z]{2,}/i, what: "an email address" },
  { re: /https?:\/\//i, what: "a link (put links in the screenshot field)" },
];

/** What a note gives away, if anything. */
export function identifyingContent(note: string): string | null {
  return IDENTIFYING.find((i) => i.re.test(note))?.what ?? null;
}

const str = (v: unknown, max: number) => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s && s.length <= max ? s : s ? undefined : null; // undefined: present but too long
};

/** An https link of at most 500 characters, or null. */
export function httpsUrl(v: string): string | null {
  if (v.length > 500) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.hostname.includes(".") && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/**
 * Validates a submitted outcome report. Returns the clean input or the
 * problems, in the order the form shows its fields. `today` is injectable for tests.
 */
export function parseOutcome(
  get: (name: string) => unknown,
  today = new Date(),
): { ok: true; value: OutcomeInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const serviceId = get("serviceId");
  if (!isUuid(serviceId)) errors.push("Pick the service you sent to.");

  const result = get("result") as OutcomeResult;
  const resultOk = OUTCOME_RESULTS.includes(result);
  if (!resultOk) errors.push("Choose what happened.");

  const amountBand = get("amountBand") as AmountBand;
  if (!AMOUNT_BANDS.includes(amountBand)) errors.push("Choose the amount range, or “Prefer not to say”.");

  const routeRaw = get("route");
  const route = (routeRaw == null || routeRaw === "" ? "unknown" : routeRaw) as OutcomeRoute;
  if (!OUTCOME_ROUTES.includes(route)) errors.push("Choose how you sent it, or “Not sure”.");

  const sentOn = str(get("sentOn"), 10);
  const weekOf = typeof sentOn === "string" ? mondayOf(sentOn) : null;
  const todayDay = today.toISOString().slice(0, 10);
  if (!weekOf || !sentOn) errors.push("Give the date you sent it.");
  else if (sentOn > todayDay) errors.push("The date can't be in the future.");
  else if (Date.parse(`${sentOn}T00:00:00Z`) < ZCASH_LAUNCH) errors.push("That date is before Zcash launched.");

  let daysHeld: number | null = null;
  if (resultOk && HELD_RESULTS.includes(result)) {
    const raw = str(get("daysHeld"), 6);
    const n = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
    // A hold can't be longer than the time since the week it was sent in.
    const maxDays = weekOf ? Math.floor((Date.parse(`${todayDay}T00:00:00Z`) - Date.parse(`${weekOf}T00:00:00Z`)) / DAY) : 3650;
    if (!Number.isInteger(n) || n < 0 || n > 3650) {
      errors.push(result === "held_open" ? "Say how many days it has been held so far." : "Say how many days it was held before it was credited.");
    } else if (n > maxDays) errors.push("It can't have been held longer than the time since you sent it.");
    else daysHeld = n;
  }

  let creditMinutes: number | null = null;
  if (result === "credited") {
    const raw = str(get("creditMinutes"), 6);
    if (raw) {
      const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
      if (!Number.isInteger(n) || n > 43_200) errors.push("Minutes to credit should be a whole number up to 43,200 (30 days), or leave it empty.");
      else creditMinutes = Math.round(n / 5) * 5; // rounded to 5 minutes, as published
    } else if (raw === undefined) errors.push("Minutes to credit should be a whole number up to 43,200 (30 days), or leave it empty.");
  }

  let evidenceUrl: string | null = null;
  const ev = str(get("evidenceUrl"), 500);
  if (ev === undefined) errors.push("The screenshot link is too long (500 characters at most).");
  else if (ev) {
    evidenceUrl = httpsUrl(ev);
    if (!evidenceUrl) errors.push("The screenshot link must start with https://.");
  }

  const noteRaw = str(get("note"), 280);
  let note: string | null = null;
  if (noteRaw === undefined) errors.push("Keep the note to 280 characters.");
  else if (noteRaw) {
    const flat = noteRaw.replace(/\s+/g, " ");
    const leak = identifyingContent(flat);
    if (leak) errors.push(`Take ${leak} out of the note. Reports never keep anything that could point to your transaction.`);
    else if (!isPlainText(flat)) errors.push("The note can only hold plain text.");
    else note = flat;
  }

  if (get("own") !== "yes") errors.push("Confirm this happened to you and that you've left out addresses, transaction IDs and account names.");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: { serviceId: serviceId as string, result, amountBand, route, weekOf: weekOf!, daysHeld, creditMinutes, evidenceUrl, note },
  };
}
