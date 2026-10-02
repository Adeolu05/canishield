import Link from "next/link";
import { notFound } from "next/navigation";
import type { Report } from "@zecproof/db";
import { OutcomeBadge, StaleBadge, TierBadge } from "@/components/badges";
import { isStale, reportDate, testDate } from "@/lib/evidence";
import { ADDRESS_TYPE_LABEL, POOL_LABEL } from "@/lib/labels";
import { NETWORKS, basePath, canCreateTests, formatAmount, type NetworkId } from "@/lib/network";
import { getServiceDetail } from "@/lib/queries";

const mono = "break-all font-mono text-xs";
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

function ReportCard({ report, base, now }: { report: Report; base: string; now: Date }) {
  const date = reportDate(report);
  return (
    <article className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        {report.addressType && <span className="font-medium">{ADDRESS_TYPE_LABEL[report.addressType]}</span>}
        <OutcomeBadge outcome={report.outcome} />
        <TierBadge tier={report.tier} />
        {report.status === "unreviewed" && <span className="text-xs text-zinc-500">Pending review</span>}
        <span className="ml-auto flex items-center gap-1.5 text-xs text-zinc-500">
          {report.tier === "listing" ? "Read" : "Reported"} {isoDate(date)}
          {isStale(date, now) && <StaleBadge />}
        </span>
      </div>
      {report.note && <p className="mt-2">{report.note}</p>}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {report.evidenceUrl && (
          <a href={report.evidenceUrl} className="hover:underline" rel="noreferrer nofollow" target="_blank">
            Screenshot ↗
          </a>
        )}
        {report.sourceUrl && (
          <a href={report.sourceUrl} className="hover:underline" rel="noreferrer nofollow" target="_blank">
            Original listing ↗
          </a>
        )}
        {report.testId && (
          <Link href={`${base}/test/${report.testId}`} className="hover:underline">
            Test and address used →
          </Link>
        )}
      </div>
      {report.txid && <p className={`mt-2 ${mono}`}>{report.txid}</p>}
    </article>
  );
}

export async function ServiceView({ network, slug }: { network: NetworkId; slug: string }) {
  const detail = await getServiceDetail(network, slug);
  if (!detail) notFound();
  const { service, tests, communityReports, listings } = detail;
  const base = basePath(network);
  const profile = NETWORKS[network];
  const walletKind = network === "testnet" ? "a testnet watch-only wallet" : "a watch-only wallet";
  const explorerKind = network === "testnet" ? "a testnet block explorer" : "a block explorer";
  const now = new Date();

  return (
    <div className="space-y-10">
      <div>
        <Link href={base || "/"} className="text-sm text-zinc-500 hover:underline">
          ← Board
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{service.name}</h1>
        <p className="mt-1 text-sm capitalize text-zinc-500">
          {service.kind}
          {service.websiteUrl && (
            <>
              {" · "}
              <a href={service.websiteUrl} className="normal-case hover:underline" rel="noreferrer" target="_blank">
                {service.websiteUrl}
              </a>
            </>
          )}
        </p>
        {service.notes && <p className="mt-3 text-sm">{service.notes}</p>}
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">On-chain evidence</h2>
          {canCreateTests(network) && (
            <Link
              href={`${base}/test?service=${service.id}`}
              className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
            >
              Run a test
            </Link>
          )}
        </div>
        {tests.length === 0 && <p className="text-sm text-zinc-500">No verified tests yet.</p>}
        {tests.map((t) => (
          <article key={t.id} className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{ADDRESS_TYPE_LABEL[t.addressType]}</span>
              {t.receivedPool && <OutcomeBadge outcome={t.receivedPool} />}
              <TierBadge tier="verified" />
              <span className="ml-auto flex items-center gap-1.5 text-xs text-zinc-500">
                Verified {isoDate(testDate(t))}
                {isStale(testDate(t), now) && <StaleBadge />}
              </span>
            </div>
            <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-zinc-500">Sent to</dt>
              <dd className={mono}>{t.receiveAddress ?? "—"}</dd>
              <dt className="text-zinc-500">Landed in</dt>
              <dd>{t.receivedPool && POOL_LABEL[t.receivedPool]}</dd>
              <dt className="text-zinc-500">Amount</dt>
              <dd>{t.receivedAmountZat != null ? formatAmount(t.receivedAmountZat, network) : "—"}</dd>
              <dt className="text-zinc-500">Block</dt>
              <dd>{t.receivedHeight}</dd>
              <dt className="text-zinc-500">Txid</dt>
              <dd className={mono}>{t.receivedTxid}</dd>
              {t.explorerName && (
                <>
                  <dt className="text-zinc-500">Cross-checked</dt>
                  <dd>
                    Confirmed on {t.explorerName}
                    {t.explorerConfirmedAt && ` (${isoDate(t.explorerConfirmedAt)})`}
                  </dd>
                </>
              )}
              {t.receivedMemo && (
                <>
                  <dt className="text-zinc-500">Memo</dt>
                  <dd className="whitespace-pre-wrap font-mono text-xs">{t.receivedMemo}</dd>
                </>
              )}
              <dt className="text-zinc-500">Viewing key</dt>
              <dd className={mono}>{t.ufvk ?? <span className="font-sans text-zinc-500">Not published</span>}</dd>
              {t.testerNote && (
                <>
                  <dt className="text-zinc-500">Tester note</dt>
                  <dd>{t.testerNote}</dd>
                </>
              )}
            </dl>
            <p className="border-t border-zinc-200 pt-3 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
              <strong className="font-medium">How to verify this yourself:</strong>{" "}
              {t.ufvk && `import the viewing key into ${walletKind} (e.g. Zingo) and look for this payment, or `}
              {t.receivedTxid ? (
                <>
                  look up the txid on{" "}
                  <a href={profile.explorerTxUrl(t.receivedTxid)} className="underline" rel="noreferrer" target="_blank">
                    {explorerKind}
                  </a>{" "}
                  to confirm the transaction and block (only the viewing key shows which address it paid).
                </>
              ) : (
                "no txid recorded."
              )}
            </p>
          </article>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Community reports</h2>
        {communityReports.length === 0 && <p className="text-sm text-zinc-500">No community reports yet.</p>}
        {communityReports.map((r) => (
          <ReportCard key={r.id} report={r} base={base} now={now} />
        ))}
        {/* TODO: report submission form (writes a community report with status "unreviewed"). */}
      </section>

      {listings.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Unverified listings</h2>
          <p className="text-sm text-zinc-500">
            Imported from existing lists and never tested by ZecProof. Quotes are adapted from the source under its license
            (ZecHub: CC BY-SA 4.0, ZecHub contributors).
          </p>
          {listings.map((r) => (
            <ReportCard key={r.id} report={r} base={base} now={now} />
          ))}
        </section>
      )}
    </div>
  );
}
