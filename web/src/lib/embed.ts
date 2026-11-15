// The "Before you send" card for other sites: one summary, used by the JSON
// endpoint (/api/services/[slug]) and the embeddable card (/embed/[slug]), so
// the two always agree with each other and with the service page.
// Pure, so it can be unit tested. Only fields that are already public on the
// service page go in.
import type { DepositAddressType, DepositResult, OutcomeResult } from "@zecproof/db";
import { DEPOSIT_RESULT_LABEL, DEPOSIT_TO, roundedDuration, roundedMinutes } from "./deposit-core";
import { OUTCOME_RESULT_LABEL } from "./outcome";
import { recordFor, weekLabel, type OutcomeRow } from "./outcome-record";

export const EMBED_THEMES = ["auto", "light", "dark"] as const;
export type EmbedTheme = (typeof EMBED_THEMES)[number];
/** The ?theme= value, or "auto" (follow the visitor's light/dark setting). */
export const embedTheme = (v: string | null | undefined): EmbedTheme =>
  (EMBED_THEMES as readonly string[]).includes(v ?? "") ? (v as EmbedTheme) : "auto";

/** The deposit-check columns the card needs. */
export type DepositInput = {
  addressType: DepositAddressType;
  result: DepositResult | null;
  blockTime: Date | null;
  creditedAt: Date | null;
};

/** The newest published deposit check with a result, by when the payment landed. */
export function latestDeposit<T extends DepositInput>(deposits: readonly T[]): T | undefined {
  return deposits
    .filter((d) => d.result && d.blockTime)
    .reduce<T | undefined>((best, d) => (!best || d.blockTime!.getTime() > best.blockTime!.getTime() ? d : best), undefined);
}

export type EmbedSummary = {
  service: { slug: string; name: string };
  /** The service page, where the full record and the sources are. */
  url: string;
  /** Where to report an outcome, when reports are open. */
  reportUrl: string | null;
  deposit: {
    result: DepositResult;
    label: string;
    addressType: DepositAddressType;
    /** "a TEX", for "to a TEX deposit address". */
    to: string;
    /** The day the payment landed, YYYY-MM-DD (UTC). */
    date: string;
    /** Minutes to credit, rounded as published; null unless credited. */
    creditMinutes: number | null;
    /** "about 10 min"; null unless credited. */
    credit: string | null;
    ok: boolean;
  } | null;
  outcomes: {
    total: number;
    counts: Partial<Record<OutcomeResult, number>>;
    latest: { result: OutcomeResult; label: string; weekOf: string; week: string } | null;
    /** Reports where the money did not simply arrive. */
    trouble: number;
  };
};

export function embedSummary(input: {
  service: { id: string; slug: string; name: string };
  deposits: readonly DepositInput[];
  outcomes: readonly OutcomeRow[];
  siteUrl: string;
  reportOpen: boolean;
}): EmbedSummary {
  const { service, siteUrl } = input;
  const d = latestDeposit(input.deposits);
  const record = recordFor(input.outcomes);
  const credited = d?.result === "credited" && d.creditedAt && d.blockTime;
  const ms = credited ? d.creditedAt!.getTime() - d.blockTime!.getTime() : 0;
  return {
    service: { slug: service.slug, name: service.name },
    url: `${siteUrl}/services/${encodeURIComponent(service.slug)}`,
    reportUrl: input.reportOpen ? `${siteUrl}/report/outcome?service=${encodeURIComponent(service.id)}` : null,
    deposit: d
      ? {
          result: d.result!,
          label: DEPOSIT_RESULT_LABEL[d.result!],
          addressType: d.addressType,
          to: DEPOSIT_TO[d.addressType],
          date: d.blockTime!.toISOString().slice(0, 10),
          creditMinutes: credited ? roundedMinutes(ms) : null,
          credit: credited ? roundedDuration(ms) : null,
          ok: d.result === "credited",
        }
      : null,
    outcomes: {
      total: record.total,
      counts: record.counts,
      latest: record.latest
        ? {
            result: record.latest.result,
            label: OUTCOME_RESULT_LABEL[record.latest.result].title,
            weekOf: record.latest.weekOf,
            week: weekLabel(record.latest.weekOf),
          }
        : null,
      trouble: record.trouble,
    },
  };
}
