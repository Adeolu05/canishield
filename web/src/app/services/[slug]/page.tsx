import Link from "next/link";
import { notFound } from "next/navigation";
import { PoolBadge, RejectedBadge, TierBadge } from "@/components/badges";
import { ADDRESS_TYPE_LABEL, POOL_LABEL, formatTaz } from "@/lib/labels";
import { getServiceDetail } from "@/lib/queries";

const mono = "break-all font-mono text-xs";

export default async function ServicePage(props: PageProps<"/services/[slug]">) {
  const { slug } = await props.params;
  const detail = await getServiceDetail(slug);
  if (!detail) notFound();
  const { service, tests, reports } = detail;

  return (
    <div className="space-y-10">
      <div>
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
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
          <Link
            href={`/test?service=${service.id}`}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
          >
            Run a test
          </Link>
        </div>
        {tests.length === 0 && <p className="text-sm text-zinc-500">No completed tests yet.</p>}
        {tests.map((t) => (
          <article key={t.id} className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{ADDRESS_TYPE_LABEL[t.addressType]}</span>
              {t.status === "address_rejected" ? <RejectedBadge /> : t.receivedPool && <PoolBadge pool={t.receivedPool} />}
              <TierBadge tier="verified" />
              <span className="ml-auto text-xs text-zinc-500">{t.updatedAt.toISOString().slice(0, 10)}</span>
            </div>
            <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-zinc-500">Sent to</dt>
              <dd className={mono}>{t.receiveAddress ?? "—"}</dd>
              {t.status === "received" && (
                <>
                  <dt className="text-zinc-500">Landed in</dt>
                  <dd>{t.receivedPool && POOL_LABEL[t.receivedPool]}</dd>
                  <dt className="text-zinc-500">Amount</dt>
                  <dd>{t.receivedAmountZat != null ? formatTaz(t.receivedAmountZat) : "—"}</dd>
                  <dt className="text-zinc-500">Block</dt>
                  <dd>{t.receivedHeight}</dd>
                  <dt className="text-zinc-500">Txid</dt>
                  <dd className={mono}>{t.receivedTxid}</dd>
                  {t.receivedMemo && (
                    <>
                      <dt className="text-zinc-500">Memo</dt>
                      <dd className="whitespace-pre-wrap font-mono text-xs">{t.receivedMemo}</dd>
                    </>
                  )}
                </>
              )}
              <dt className="text-zinc-500">Viewing key</dt>
              <dd className={mono}>
                {t.ufvk ?? <span className="font-sans text-zinc-500">Not published (recorded outside the worker)</span>}
              </dd>
              {t.testerNote && (
                <>
                  <dt className="text-zinc-500">Tester note</dt>
                  <dd>{t.testerNote}</dd>
                </>
              )}
            </dl>
          </article>
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">User reports</h2>
        {reports.length === 0 && <p className="text-sm text-zinc-500">No user reports yet.</p>}
        {reports.map((r) => (
          <article key={r.id} className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <div className="flex flex-wrap items-center gap-2">
              {r.addressType && <span className="font-medium">{ADDRESS_TYPE_LABEL[r.addressType]}</span>}
              {r.outcome === "address_rejected" ? <RejectedBadge /> : <PoolBadge pool={r.outcome} />}
              <TierBadge tier="reported" />
              <span className="text-xs capitalize text-zinc-500">{r.status}</span>
            </div>
            {r.note && <p className="mt-2">{r.note}</p>}
            {r.txid && <p className={`mt-2 ${mono}`}>{r.txid}</p>}
          </article>
        ))}
        {/* TODO: report submission form (writes `reports` with status "unreviewed"). */}
      </section>
    </div>
  );
}
