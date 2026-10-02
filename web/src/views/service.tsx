import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import type { Report, Test } from "@zecproof/db";
import { ListedClaimBadge, ListingSource, OutcomeBadge } from "@/components/badges";
import { CopyButton } from "@/components/copy-button";
import { PendingChip, StaleChip, StatusIcon, TONE_SOFT, TONE_TEXT, TierChip } from "@/components/status";
import { isStale, readinessOf, reportDate, testDate } from "@/lib/evidence";
import { ADDRESS_TYPE_LABEL, POOL_LABEL } from "@/lib/labels";
import { NETWORKS, basePath, canCreateTests, formatAmount, type NetworkId } from "@/lib/network";
import { isoDay, shortDate, verdictFor } from "@/lib/present";
import { getServiceDetail } from "@/lib/queries";
import { SITE_URL } from "@/lib/site";
import { ShareProof } from "@/components/share";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-xs font-medium text-subtle">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

function HashField({ label, value, copyLabel }: { label: string; value: string | null; copyLabel: string }) {
  return (
    <Field label={label}>
      {value ? (
        <div className="flex items-start gap-2">
          <span className="hash min-w-0 flex-1 rounded-md bg-surface-2 px-2 py-1">{value}</span>
          <CopyButton value={value} label={copyLabel} />
        </div>
      ) : (
        <span className="text-subtle">—</span>
      )}
    </Field>
  );
}

function EvidenceCard({ t, network, now, service }: { t: Test; network: NetworkId; now: Date; service: { name: string; slug: string } }) {
  const profile = NETWORKS[network];
  const date = testDate(t);
  const walletKind = network === "testnet" ? "a testnet watch-only wallet" : "a watch-only wallet";
  return (
    <article id={`test-${t.id}`} className="overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-4 py-4">
        <h3 className="text-sm font-semibold">{ADDRESS_TYPE_LABEL[t.addressType]}</h3>
        {t.receivedPool && <OutcomeBadge outcome={t.receivedPool} />}
        <TierChip tier="verified" />
        <span className="ml-auto flex items-center gap-2 text-xs text-subtle">
          Verified <time dateTime={isoDay(date)}>{shortDate(date, now)}</time>
          {isStale(date, now) && <StaleChip />}
        </span>
      </header>
      <dl className="divide-y divide-line px-4">
        <HashField label="Sent to" value={t.receiveAddress} copyLabel="address" />
        <Field label="Landed in">{t.receivedPool ? POOL_LABEL[t.receivedPool] : "—"}</Field>
        <Field label="Amount">{t.receivedAmountZat != null ? formatAmount(t.receivedAmountZat, network) : "—"}</Field>
        <Field label="Block">
          <span className="hash">{t.receivedHeight?.toLocaleString("en-US") ?? "—"}</span>
        </Field>
        {t.receivedBlockHash || t.receivedPool !== "transparent" ? (
          <HashField label="Block hash" value={t.receivedBlockHash} copyLabel="block hash" />
        ) : (
          <Field label="Block hash">
            <span className="text-subtle">Not recorded for transparent receipts (matched by block height)</span>
          </Field>
        )}
        <Field label="Txid">
          {t.receivedTxid ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="hash min-w-0 flex-1 rounded-md bg-surface-2 px-2 py-1">{t.receivedTxid}</span>
                <CopyButton value={t.receivedTxid} label="txid" />
              </div>
              <a
                href={profile.explorerTxUrl(t.receivedTxid)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-accent-ink underline-offset-2 hover:underline"
              >
                Open in block explorer <ExternalLink aria-hidden="true" className="size-3" />
              </a>
            </div>
          ) : (
            "—"
          )}
        </Field>
        {t.explorerName && (
          <Field label="Cross-checked">
            Confirmed on {t.explorerName}
            {t.explorerConfirmedAt && ` · ${shortDate(t.explorerConfirmedAt, now)}`}
          </Field>
        )}
        {t.receivedMemo && (
          <Field label="Memo">
            <span className="hash whitespace-pre-wrap">{t.receivedMemo}</span>
          </Field>
        )}
        <Field label="Viewing key">
          {t.ufvk ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="hash min-w-0 flex-1 truncate rounded-md bg-surface-2 px-2 py-1">{t.ufvk}</span>
                <CopyButton value={t.ufvk} label="viewing key" />
              </div>
              <details>
                <summary className="cursor-pointer text-xs font-medium text-accent-ink">Show the full key</summary>
                <p className="hash mt-2 rounded-md bg-surface-2 px-2 py-1">{t.ufvk}</p>
              </details>
              <p className="text-xs text-subtle">Published on purpose: this throwaway wallet holds nothing else.</p>
            </div>
          ) : (
            <span className="text-subtle">Not published</span>
          )}
        </Field>
        {t.testerNote && <Field label="Tester note">{t.testerNote}</Field>}
      </dl>
      <section aria-label="Re-check it yourself" className="border-t border-line bg-surface-2/60 px-4 py-4">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-subtle">Re-check it yourself</h4>
        <ol className="mt-2 list-decimal space-y-1 pl-6 text-sm text-muted">
          {t.ufvk && <li>Import the viewing key into {walletKind} (e.g. Zingo) and look for this payment.</li>}
          {t.receivedTxid && <li>Open the txid in a block explorer and check it is in block <span className="tabular-nums">{t.receivedHeight?.toLocaleString("en-US")}</span>.</li>}
          <li>Only the viewing key shows which address was paid; the explorer confirms the transaction and its block.</li>
        </ol>
      </section>
      {t.receivedPool && t.receivedHeight != null && (
        <div className="border-t border-line px-4 py-2">
          <ShareProof
            url={`${SITE_URL}${basePath(network)}/services/${service.slug}#test-${t.id}`}
            text={`${service.name} ${ADDRESS_TYPE_LABEL[t.addressType]} → landed in ${POOL_LABEL[t.receivedPool]}. Verified on-chain, block ${t.receivedHeight.toLocaleString("en-US")}.`}
          />
        </div>
      )}
    </article>
  );
}

function ReportCard({ report, base, now }: { report: Report; base: string; now: Date }) {
  const date = reportDate(report);
  const listing = report.tier === "listing";
  return (
    <article className={`rounded-xl border bg-surface p-4 text-sm ${listing ? "border-dashed border-line-strong" : "border-line shadow-card"}`}>
      <div className="flex flex-wrap items-center gap-2">
        {report.addressType && <span className="font-semibold">{ADDRESS_TYPE_LABEL[report.addressType]}</span>}
        {listing ? (
          <>
            <ListedClaimBadge outcome={report.outcome} />
            <ListingSource sourceUrl={report.sourceUrl} />
          </>
        ) : (
          <>
            <OutcomeBadge outcome={report.outcome} />
            <TierChip tier="community" />
            {report.status === "unreviewed" && <PendingChip />}
          </>
        )}
        <span className="ml-auto flex items-center gap-2 text-xs text-subtle">
          {listing ? "Read" : "Reported"} <time dateTime={isoDay(date)}>{shortDate(date, now)}</time>
          {isStale(date, now) && <StaleChip />}
        </span>
      </div>
      {report.note && <p className="mt-2 text-pretty text-muted">{report.note}</p>}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium">
        {report.evidenceUrl && (
          <a href={report.evidenceUrl} className="inline-flex items-center gap-1 text-accent-ink hover:underline" rel="noreferrer nofollow" target="_blank">
            Screenshot <ExternalLink aria-hidden="true" className="size-3" />
          </a>
        )}
        {report.sourceUrl && (
          <a href={report.sourceUrl} className="inline-flex items-center gap-1 text-accent-ink hover:underline" rel="noreferrer nofollow" target="_blank">
            Original listing <ExternalLink aria-hidden="true" className="size-3" />
          </a>
        )}
        {report.testId && (
          <Link href={`${base}/test/${report.testId}`} className="inline-flex items-center gap-1 text-accent-ink hover:underline">
            Test and address used <ArrowRight aria-hidden="true" className="size-3" />
          </Link>
        )}
      </div>
      {report.txid && <p className="hash mt-2">{report.txid}</p>}
    </article>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint && <p className="text-xs text-subtle">{hint}</p>}
    </div>
  );
}

export async function ServiceView({ network, slug }: { network: NetworkId; slug: string }) {
  const detail = await getServiceDetail(network, slug);
  if (!detail) notFound();
  const { service, tests, communityReports, listings } = detail;
  const base = basePath(network);
  const now = new Date();
  const visible = [...communityReports, ...listings];
  const verdict = verdictFor(readinessOf(tests, visible), tests, visible, now);
  const testsOpen = canCreateTests(network);
  const nothing = tests.length === 0 && communityReports.length === 0;

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <Link href={base || "/"} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
          <ArrowLeft aria-hidden="true" className="size-4" /> Board
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{service.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted">
              <span className="capitalize">{service.kind}</span>
              {service.websiteUrl && (
                <>
                  <span aria-hidden="true">·</span>
                  <a href={service.websiteUrl} className="inline-flex items-center gap-1 hover:text-foreground" rel="noreferrer" target="_blank">
                    {service.websiteUrl.replace(/^https?:\/\//, "")}
                    <ExternalLink aria-hidden="true" className="size-3" />
                  </a>
                </>
              )}
            </p>
          </div>
          {testsOpen && (
            <Link
              href={`${base}/test?service=${service.id}`}
              className="inline-flex items-center gap-2 rounded-lg bg-btn px-4 py-2 text-sm font-medium text-btn-fg shadow-card transition-opacity duration-150 hover:opacity-90"
            >
              Run a test <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          )}
        </div>

        <div role="status" className="flex items-start gap-4 rounded-xl border border-line bg-surface p-4 shadow-card">
          <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${TONE_SOFT[verdict.tone]}`}>
            <StatusIcon icon={verdict.icon} className="size-5" />
          </span>
          <div>
            <p className="text-lg font-semibold leading-snug">
              <span className={TONE_TEXT[verdict.tone]}>{verdict.title}</span>
              <span className="font-normal text-muted"> — {verdict.detail}</span>
            </p>
            {service.notes && <p className="mt-1 text-sm text-subtle">{service.notes}</p>}
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <SectionTitle title="On-chain evidence" hint="txid, block and viewing key for every verified payment" />
        {tests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
            <p className="font-medium">No verified payments yet</p>
            <p className="mt-1 text-sm text-muted">
              {testsOpen
                ? "Run a test: you get a fresh address, send the smallest amount the service allows, and the scanner records where it lands."
                : "Verified results appear here once a test payment lands."}
            </p>
            {testsOpen && (
              <Link href={`${base}/test?service=${service.id}`} className="mt-4 inline-flex rounded-lg border border-line-strong px-4 py-2 text-sm transition-colors duration-150 hover:bg-surface-2">
                Start a test
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {tests.map((t) => (
              <EvidenceCard key={t.id} t={t} network={network} now={now} service={service} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <SectionTitle title="Community reports" hint="observed, not provable on-chain" />
        {communityReports.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
            No community reports {nothing ? "or tests " : ""}yet.
          </p>
        ) : (
          <div className="space-y-4">
            {communityReports.map((r) => (
              <ReportCard key={r.id} report={r} base={base} now={now} />
            ))}
          </div>
        )}
        {/* TODO: report submission form (writes a community report with status "unreviewed"). */}
      </section>

      {listings.length > 0 && (
        <section className="space-y-4">
          <SectionTitle title="Unverified listings" hint="someone else's claims; never tested by ZecProof" />
          <div className="space-y-4">
            {listings.map((r) => (
              <ReportCard key={r.id} report={r} base={base} now={now} />
            ))}
          </div>
          <p className="text-xs text-subtle">
            Quotes adapted from the source under its license (ZecHub: CC BY-SA 4.0, ZecHub contributors).
          </p>
        </section>
      )}
    </div>
  );
}
