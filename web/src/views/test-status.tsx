import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Hourglass, ShieldAlert, TriangleAlert } from "lucide-react";
import { markAddressRejected } from "@/app/actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { OutcomeBadge } from "@/components/badges";
import { CopyButton } from "@/components/copy-button";
import { Countdown, LiveDot } from "@/components/live";
import { QrCode } from "@/components/qr";
import { StatusIcon, TONE_SOFT, TierChip } from "@/components/status";
import { Stepper } from "@/components/stepper";
import { ADDRESS_TYPE_LABEL, POOL_LABEL, STATUS_LABEL } from "@/lib/labels";
import { NETWORKS, basePath, formatAmount, type NetworkId } from "@/lib/network";
import { zip321Uri } from "@/lib/present";
import { SITE_URL } from "@/lib/site";
import { VerifiedReceipt, WatchMarker } from "@/components/verified-receipt";
import { getTest } from "@/lib/queries";

const POLL_SECONDS = 10;

/** Which step is current (0 Choose · 1 Address · 2 Send · 3 Verified). */
const STEP: Record<string, number> = { pending: 1, awaiting_payment: 2, confirming: 3, received: 3, address_rejected: 2, expired: 2, failed: 1 };

function Panel({ tone, icon, title, children }: { tone: "ok" | "bad" | "warn" | "neutral"; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="zp-fade rounded-xl border border-line bg-surface p-6 shadow-card">
      <div className="flex items-start gap-4">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${TONE_SOFT[tone]}`}>{icon}</span>
        <div className="min-w-0 flex-1 space-y-4">
          <h2 className="text-lg font-semibold leading-snug">{title}</h2>
          {children}
        </div>
      </div>
    </section>
  );
}

export async function TestStatusView({ network, id }: { network: NetworkId; id: string }) {
  const row = await getTest(network, id);
  if (!row) notFound();
  const { test, service } = row;
  const profile = NETWORKS[network];
  const base = basePath(network);
  const live = test.status === "pending" || test.status === "awaiting_payment" || test.status === "confirming";
  const ended = test.status === "address_rejected" || test.status === "expired" || test.status === "failed";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {live && <AutoRefresh intervalMs={POLL_SECONDS * 1000} />}
      {live && <WatchMarker testId={test.id} />}
      <div className="space-y-6">
        <Stepper current={STEP[test.status] ?? 1} done={test.status === "received"} failed={ended} />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">
              {service.name} · {ADDRESS_TYPE_LABEL[test.addressType]}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{STATUS_LABEL[test.status]}</h1>
          </div>
          {live && <LiveDot intervalSeconds={POLL_SECONDS} />}
        </div>
      </div>

      {test.status === "pending" && (
        <Panel tone="neutral" icon={<Hourglass aria-hidden="true" className="size-5" />} title="Preparing a fresh address">
          <p className="text-sm text-muted">The scanner assigns a throwaway address within about 30 seconds. This page updates by itself.</p>
          <div className="h-24 animate-pulse rounded-lg bg-surface-2" aria-hidden="true" />
          {test.error && <p className="text-xs text-bad">{test.error}</p>}
        </Panel>
      )}

      {test.status === "awaiting_payment" && test.receiveAddress && (
        <>
          <section className="rounded-xl border border-line bg-surface p-6 shadow-card">
            <h2 className="text-sm font-semibold">
              Withdraw from {service.name} to this address
            </h2>
            <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="shrink-0 self-center rounded-xl border border-line bg-white p-2 sm:self-start">
                <QrCode value={zip321Uri(test.receiveAddress)} label={`QR code for the test address, ${ADDRESS_TYPE_LABEL[test.addressType]}`} />
              </div>
              <div className="min-w-0 flex-1 space-y-4">
                <p className="hash rounded-lg bg-surface-2 p-4 text-sm">{test.receiveAddress}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <CopyButton value={test.receiveAddress} label="address" />
                  <span className="text-xs text-subtle">QR encodes a ZIP-321 payment URI, no amount.</span>
                </div>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div className="rounded-lg border border-line p-4">
                    <dt className="text-xs text-subtle">Expires in</dt>
                    <dd className="mt-0.5 font-semibold">{test.expiresAt ? <Countdown until={test.expiresAt.toISOString()} /> : "No expiry"}</dd>
                  </div>
                  <div className="rounded-lg border border-line p-4">
                    <dt className="text-xs text-subtle">Watching from block</dt>
                    <dd className="hash mt-0.5 font-semibold">{test.birthdayHeight?.toLocaleString("en-US")}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>

          <section className="space-y-2 rounded-xl border border-line bg-warn-soft p-4 text-sm text-warn">
            <p className="flex gap-2">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong className="font-semibold">Privacy:</strong> this address and its viewing key are published with the result.
                If you withdraw from an account in your name, the service knows the withdrawal was yours, and anyone can see that this
                address received it.
              </span>
            </p>
            <p className="flex gap-2">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong className="font-semibold">Test funds aren&apos;t returned.</strong> Send the smallest amount of {profile.unit} the
                service allows.
              </span>
            </p>
          </section>

          {test.error && <p className="text-xs text-bad">Scanner error (will retry): {test.error}</p>}

          <details className="rounded-xl border border-line bg-surface p-4 shadow-card">
            <summary className="cursor-pointer text-sm font-semibold">Did the service refuse this address?</summary>
            <form action={markAddressRejected.bind(null, test.id)} className="mt-4 space-y-4">
              <p className="text-xs text-subtle">
                This can&apos;t be proven on-chain, so it is filed as a community report and reviewed. Reports are published under CC BY
                4.0.
              </p>
              <div className="space-y-1">
                <label htmlFor="note" className="text-xs font-medium">
                  Error message (optional)
                </label>
                <input id="note" name="note" placeholder="e.g. “Enter a valid address”" className="h-10 w-full rounded-lg border border-line-strong bg-surface px-4 text-sm" />
              </div>
              <div className="space-y-1">
                <label htmlFor="evidenceUrl" className="text-xs font-medium">
                  Screenshot link (optional)
                </label>
                <input id="evidenceUrl" name="evidenceUrl" type="url" placeholder="https://…" className="h-10 w-full rounded-lg border border-line-strong bg-surface px-4 text-sm" />
              </div>
              <button type="submit" className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium transition-colors duration-150 hover:bg-surface-2">
                Mark address as rejected
              </button>
            </form>
          </details>
        </>
      )}

      {test.status === "confirming" && test.receivedPool && (
        <Panel tone="neutral" icon={<Hourglass aria-hidden="true" className="size-5" />} title="Payment seen: confirming">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            Landed in <OutcomeBadge outcome={test.receivedPool} />
            {test.receivedAmountZat != null && <span className="text-muted">· {formatAmount(test.receivedAmountZat, network)}</span>}
            <span className="text-muted">· block {test.receivedHeight}</span>
          </div>
          <p className="hash text-muted">{test.receivedTxid}</p>
          <p className="text-sm text-muted">
            Waiting for {profile.requiredConfirmations} confirmation{profile.requiredConfirmations > 1 ? "s" : ""}
            {profile.requireExplorerCheck && " and an independent block explorer check"} before this counts as verified.
          </p>
          {test.error && <p className="text-xs text-subtle">{test.error}</p>}
        </Panel>
      )}

      {test.status === "received" && test.receivedPool && test.receivedTxid && (
        <VerifiedReceipt
          testId={test.id}
          serviceName={service.name}
          serviceHref={`${base}/services/${service.slug}`}
          addressTypeLabel={ADDRESS_TYPE_LABEL[test.addressType]}
          pool={test.receivedPool}
          amount={test.receivedAmountZat != null ? formatAmount(test.receivedAmountZat, network) : null}
          txid={test.receivedTxid}
          height={test.receivedHeight?.toLocaleString("en-US") ?? "Not recorded"}
          explorerName={test.explorerName}
          shareUrl={`${SITE_URL}${base}/test/${test.id}`}
          shareText={`${service.name} ${ADDRESS_TYPE_LABEL[test.addressType]} → landed in ${POOL_LABEL[test.receivedPool]}. Verified on-chain, block ${test.receivedHeight?.toLocaleString("en-US")}.`}
        />
      )}

      {test.status === "address_rejected" && (
        <Panel tone="bad" icon={<StatusIcon icon="x-circle" className="size-5" />} title="The service refused this address">
          <div className="flex flex-wrap items-center gap-2">
            <OutcomeBadge outcome="address_rejected" />
            <TierChip tier="community" />
            <span className="text-xs text-subtle">Filed as a community report</span>
          </div>
          {test.testerNote && <p className="text-sm text-muted">“{test.testerNote}”</p>}
          <p className="hash text-subtle">{test.receiveAddress}</p>
          <Link href={`${base}/test?service=${service.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-accent-ink hover:underline">
            Try another address type <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Panel>
      )}

      {test.status === "expired" && (
        <Panel tone="warn" icon={<Hourglass aria-hidden="true" className="size-5" />} title="Expired: nothing arrived in time">
          <p className="text-sm text-muted">
            Tests wait 48 hours for a payment. If you still want to test {service.name}, start a new one; a late payment to this address
            isn&apos;t recorded.
          </p>
          <Link href={`${base}/test?service=${service.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-accent-ink hover:underline">
            Start a new test <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Panel>
      )}

      {test.status === "failed" && (
        <Panel tone="bad" icon={<ShieldAlert aria-hidden="true" className="size-5" />} title="This test failed">
          {test.error && <p className="text-sm text-muted">{test.error}</p>}
        </Panel>
      )}

      <Link href={`${base}/services/${service.slug}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        All evidence for {service.name} <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
  );
}
