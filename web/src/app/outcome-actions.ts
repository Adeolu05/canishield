"use server";

// Exit outcome reports: anyone who sent shielded ZEC to a service says what
// happened. Saved unreviewed; nothing counts until the maintainer accepts it.
// One report per browser per service per month, through a random token in an
// httpOnly cookie of which only the sha256 is stored (no accounts).
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { outcomeReportsEnabled } from "@/lib/network";
import { parseOutcome } from "@/lib/outcome";
import { saveOutcome } from "@/lib/outcome-store";
import { hashTesterToken, newTesterToken } from "@/lib/tester-token-core";

/** On an error, what was typed comes back so the form can show it again (React resets forms after an action). */
export type OutcomeFormState = { errors: string[]; values: Record<string, string> } | null;

const REPORTER_COOKIE = "cis_reporter";
const COOKIE_MAX_AGE_SECONDS = 180 * 86_400;
const FIELDS = ["serviceId", "result", "amountBand", "route", "sentOn", "daysHeld", "creditMinutes", "evidenceUrl", "note", "own"];

export async function reportOutcome(_prev: OutcomeFormState, formData: FormData): Promise<OutcomeFormState> {
  const values = Object.fromEntries(FIELDS.map((n) => [n, String(formData.get(n) ?? "").slice(0, 600)]));
  if (!outcomeReportsEnabled()) return { errors: ["Outcome reports are paused right now."], values };
  const parsed = parseOutcome((name) => formData.get(name));
  if (!parsed.ok) return { errors: parsed.errors, values };

  const jar = await cookies();
  let token = jar.get(REPORTER_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) token = newTesterToken().token;
  const saved = await saveOutcome(getDb(), parsed.value, hashTesterToken(token));
  if (!saved.ok) return { errors: [saved.error], values };
  jar.set(REPORTER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/report/outcome",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  redirect(`/report/outcome/thanks?service=${encodeURIComponent(saved.slug)}`);
}
