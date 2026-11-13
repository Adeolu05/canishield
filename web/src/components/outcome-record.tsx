// Exit outcomes, shown: the before-you-send card and the record on a service page, and the
// latest outcomes on the board. What may be shown is decided in lib/outcome-record.ts.
import Link from "next/link";
import { ArrowRight, ExternalLink, FlaskConical, Lock, MessageSquareWarning, Route } from "lucide-react";
import { StatusIcon, StatusLabel, TONE_SOFT } from "@/components/status";
import { ServiceIcon } from "@/components/service-icon";
import { AMOUNT_BAND_LABEL, OUTCOME_RESULT_LABEL, OUTCOME_RESULTS, OUTCOME_ROUTE_LABEL } from "@/lib/outcome";
import { DETAIL_MIN, OUTCOME_RESULT_VISUAL, heldPhrase, sourceHost, weekLabel, type OutcomeRow, type ServiceRecord } from "@/lib/outcome-record";

const reportHref = (serviceId?: string) => `/report/outcome${serviceId ? `?service=${serviceId}` : ""}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function ResultLabel({ result, className }: { result: OutcomeRow["result"]; className?: string }) {
  const v = OUTCOME_RESULT_VISUAL[result];
  return <StatusLabel icon={v.icon} tone={v.tone} label={OUTCOME_RESULT_LABEL[result].title} className={className} />;
}

/** Top of a service page: the one card to read before sending. */
/** Our own newest published deposit check, already worded for the card. */
export type DepositLine = { label: string; to: string; when: string; toCredit: string | null; ok: boolean };

export function BeforeYouSend({ record, serviceId, reportOpen, deposit }: { record: ServiceRecord; serviceId: string; reportOpen: boolean; deposit?: DepositLine | null }) {
  const { latest, total, trouble, worked } = record;
  const tone = latest ? OUTCOME_RESULT_VISUAL[latest.result].tone : "neutral";
  return (
    <aside aria-labelledby="before-you-send" className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <h2 id="before-you-send" className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-ink">
        Before you send shielded ZEC
      </h2>
      <ul className="mt-3 space-y-2 text-sm">
        {deposit && (
          <li className="flex items-start gap-3">
            <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md ${TONE_SOFT[deposit.ok ? "ok" : "warn"]}`}>
              <Lock aria-hidden="true" className="size-3.5" />
            </span>
            <span>
              Our latest deposit check (from a shielded wallet to {deposit.to} deposit address): <strong className="font-semibold">{deposit.label}</strong>
              {deposit.toCredit ? `, ${deposit.toCredit}` : ""} <span className="text-muted">({deposit.when}, checked on-chain)</span>.
            </span>
          </li>
        )}
        <li className="flex items-start gap-3">
          <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md ${TONE_SOFT[tone]}`}>
            <StatusIcon icon={latest ? OUTCOME_RESULT_VISUAL[latest.result].icon : "circle-dashed"} className="size-3.5" />
          </span>
          {latest ? (
            <span>
              Latest report: <strong className="font-semibold">{OUTCOME_RESULT_LABEL[latest.result].title}</strong>{" "}
              <span className="text-muted">({weekLabel(latest.weekOf)})</span>.{" "}
              <span className="text-muted">
                {plural(total, "reviewed report")}
                {trouble > 0 ? `, ${trouble} with a hold, refusal or refund` : ""}.
              </span>
            </span>
          ) : (
            <span className="text-muted">No one has reported what happened after sending shielded ZEC here yet.</span>
          )}
        </li>
        {worked && (
          <li className="flex items-start gap-3">
            <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md ${TONE_SOFT.ok}`}>
              <Route aria-hidden="true" className="size-3.5" />
            </span>
            <span>
              Last route that worked: <strong className="font-semibold">{OUTCOME_ROUTE_LABEL[worked.route].title}</strong>{" "}
              <span className="text-muted">({weekLabel(worked.weekOf)})</span>.
            </span>
          </li>
        )}
        <li className="flex items-start gap-3">
          <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md ${TONE_SOFT.info}`}>
            <FlaskConical aria-hidden="true" className="size-3.5" />
          </span>
          <span>Send a small test amount first, and wait for it to arrive before sending the rest.</span>
        </li>
      </ul>
      {reportOpen && (
        <Link href={reportHref(serviceId)} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent-ink underline-offset-4 hover:underline">
          Sent shielded ZEC here? Report what happened <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      )}
    </aside>
  );
}

function CaseCard({ c }: { c: OutcomeRow }) {
  const facts = [
    AMOUNT_BAND_LABEL[c.amountBand] !== AMOUNT_BAND_LABEL.unknown ? AMOUNT_BAND_LABEL[c.amountBand] : null,
    c.route !== "unknown" ? OUTCOME_ROUTE_LABEL[c.route].title : null,
    heldPhrase(c),
    c.creditMinutes != null ? `credited in about ${c.creditMinutes} min` : null,
  ].filter(Boolean);
  return (
    <article className="rounded-xl border border-line bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ResultLabel result={c.result} />
        <span className="text-xs text-subtle">{weekLabel(c.weekOf)}</span>
      </div>
      {facts.length > 0 && <p className="mt-2 text-sm text-muted">{facts.join(" · ")}</p>}
      {c.note && <p className="mt-2 text-sm">&ldquo;{c.note}&rdquo;</p>}
      {c.sourceUrl && (
        <a href={c.sourceUrl} target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent-ink underline-offset-4 hover:underline">
          Read the case on the {sourceHost(c.sourceUrl)} <ExternalLink aria-hidden="true" className="size-3" />
        </a>
      )}
    </article>
  );
}

/** A service page section: every accepted outcome, as far as the privacy rule allows. */
export function OutcomeRecordSection({ record, serviceId, reportOpen }: { record: ServiceRecord; serviceId: string; reportOpen: boolean }) {
  const hidden = record.total - record.cases.length;
  return (
    <section aria-labelledby="exit-outcomes" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="exit-outcomes" className="text-base font-semibold">
          What happened after people sent shielded ZEC
        </h2>
        <p className="text-xs text-subtle">reviewed reports; amounts as ranges, dates by week</p>
      </div>
      {record.total === 0 ? (
        <p className="max-w-none rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">No outcome reports yet.</p>
      ) : (
        <>
          <ul aria-label="Outcomes by result" className="flex flex-wrap gap-2">
            {OUTCOME_RESULTS.filter((r) => record.counts[r]).map((r) => (
              <li key={r} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs">
                <ResultLabel result={r} />
                <span className="tabular-nums text-muted">×{record.counts[r]}</span>
              </li>
            ))}
          </ul>
          {record.cases.length > 0 && (
            <div className="space-y-3">
              {record.cases.map((c) => (
                <CaseCard key={c.id} c={c} />
              ))}
            </div>
          )}
          {hidden > 0 && (
            <p className="text-xs text-subtle">
              {record.cases.length > 0 ? plural(hidden, "more report") : plural(hidden, "report")} counted above without details. Details show once a service has {DETAIL_MIN} reports, so no one
              report can be singled out.
            </p>
          )}
        </>
      )}
      {reportOpen && (
        <Link href={reportHref(serviceId)} className="flex w-fit items-center gap-2 text-sm font-medium text-accent-ink underline-offset-4 hover:underline">
          <MessageSquareWarning aria-hidden="true" className="size-4" /> Sent shielded ZEC here? Report what happened
        </Link>
      )}
    </section>
  );
}

/** The board: the newest outcomes across services (result and week only). */
export function LatestOutcomes({ rows, reportOpen }: { rows: (OutcomeRow & { serviceSlug: string; serviceName: string })[]; reportOpen: boolean }) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="latest-outcomes" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="latest-outcomes" className="text-lg font-semibold tracking-tight">
            Latest exit outcomes
          </h2>
          <p className="text-sm text-muted">What services did with shielded ZEC, as reported by the people who sent it and reviewed.</p>
        </div>
        {reportOpen && (
          <Link href={reportHref()} className="inline-flex items-center gap-1 text-sm font-medium text-accent-ink underline-offset-4 hover:underline">
            Report what happened <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        )}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/services/${r.serviceSlug}`}
              className="flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-4 shadow-card transition-colors duration-150 hover:border-line-strong"
            >
              <span className="inline-flex items-center gap-2 text-sm font-medium">
                <ServiceIcon slug={r.serviceSlug} name={r.serviceName} />
                {r.serviceName}
              </span>
              <ResultLabel result={r.result} />
              <span className="text-xs text-subtle">{weekLabel(r.weekOf)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
