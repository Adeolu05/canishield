import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BadgeCheck, Hourglass, Lock, ShieldAlert, TriangleAlert } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { CopyButton } from "@/components/copy-button";
import { Countdown, LiveDot } from "@/components/live";
import { TONE_SOFT } from "@/components/status";
import { Stepper } from "@/components/stepper";
import { DepositStartForm, ReportForm, TxidForm, WalletRefusedForm } from "@/components/deposit-forms";
import {
  DEPOSIT_ADDRESS_LABEL,
  DEPOSIT_RESULT_LABEL,
  DEPOSIT_SOURCE_LABEL,
  DEPOSIT_STATUS_LABEL,
  DEPOSIT_STEP,
  DEPOSIT_SERVICE_KINDS,
  canReportNotCredited,
  roundedDuration,
  zecExact,
} from "@/lib/deposit-core";
import { depositsEnabled, getDepositCheck } from "@/lib/deposit-checks";
import { NETWORKS, basePath, type NetworkId } from "@/lib/network";
import { listServices } from "@/lib/queries";
import { isTester } from "@/lib/tester-token";

const DEPOSIT_STEPS = ["Choose", "Send", "On-chain", "Credited"] as const;
const POLL_SECONDS = 15;

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

function PrivacyNotice() {
  return (
    <section aria-labelledby="privacy-title" className="space-y-2 rounded-xl border border-line bg-surface-2 p-4 text-sm">
      <h2 id="privacy-title" className="flex items-center gap-2 font-semibold">
        <Lock aria-hidden="true" className="size-4 text-accent-ink" /> What we keep, and what we publish
      </h2>
      <ul className="list-disc space-y-1 pl-5 text-muted">
        <li>
          Your deposit address is never stored: only its kind and a keyed hash, so our scanner can recognise the payment. The kind (for
          example &quot;TEX&quot;) is published.
        </li>
        <li>The exact amount, the txid, the block and your screenshot link are deleted when the check is reviewed. They are never published.</li>
        <li>Published: the service, the address kind, the wallet you used, the pool the money came from, whether it was credited, and how long it took.</li>
        <li>Send from your own wallet to your own account, as you normally would. Can I Shield never holds your keys or your funds.</li>
      </ul>
    </section>
  );
}

export async function DepositStartView({ network, preselected }: { network: NetworkId; preselected?: string }) {
  const base = basePath(network);
  if (!depositsEnabled(network)) {
    return (
      <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-line bg-surface p-6 shadow-card">
        <h1 className="text-2xl font-semibold tracking-tight">Check a deposit</h1>
        <p className="text-muted">
          Deposit checks aren&apos;t open on {network} yet.{" "}
          {network === "mainnet" && (
            <>
              Try the flow on the{" "}
              <Link href="/testnet/test/deposit" className="font-medium text-foreground underline underline-offset-2">
                testnet
              </Link>
              .
            </>
          )}
        </p>
      </div>
    );
  }
  const services = (await listServices(network)).filter((s) => (DEPOSIT_SERVICE_KINDS as readonly string[]).includes(s.kind));
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-6">
        <Stepper current={0} steps={DEPOSIT_STEPS} label="Deposit check progress" />
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-ink">Deposit check</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Can a shielded wallet deposit here?</h1>
          <p className="mt-2 text-pretty text-muted">
            You send a small, unique amount from your shielded wallet to your own deposit address at the service. Our scanner checks the
            payment on-chain, and you tell us whether the service credited it and how long it took.
          </p>
        </div>
      </div>
      <PrivacyNotice />
      {services.length === 0 && <p className="text-sm text-muted">No exchanges or swap services are listed on {network} yet.</p>}
      <DepositStartForm network={network} unit={NETWORKS[network].unit} services={services.map((s) => ({ id: s.id, name: s.name }))} preselected={preselected} />
      <p className="text-xs text-subtle">
        Withdrawals instead?{" "}
        <Link href={`${base}/test`} className="font-medium text-foreground underline underline-offset-2">
          Run a withdrawal test
        </Link>
        .
      </p>
    </div>
  );
}

const utc = (d: Date) => `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;

export async function DepositStatusView({ network, id }: { network: NetworkId; id: string }) {
  const row = await getDepositCheck(network, id);
  if (!row) notFound();
  const { check, service } = row;
  const base = basePath(network);
  const unit = NETWORKS[network].unit;
  const tester = await isTester(check.id, check.testerTokenHash);
  const failed = check.status === "refused" || check.status === "expired" || check.status === "wallet_refused";
  const toCredit = check.creditedAt && check.blockTime ? roundedDuration(check.creditedAt.getTime() - check.blockTime.getTime()) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Only while the worker has something to do: refreshing during awaiting_tx could interrupt the tester typing. */}
      {check.status === "verifying" && <AutoRefresh intervalMs={POLL_SECONDS * 1000} />}
      <div className="space-y-6">
        <Stepper current={check.status === "expired" && check.source ? 3 : DEPOSIT_STEP[check.status]} done={check.status === "published"} failed={failed} steps={DEPOSIT_STEPS} label="Deposit check progress" />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">
              Deposit into {service.name} · {DEPOSIT_ADDRESS_LABEL[check.addressType]} address · {check.wallet}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{DEPOSIT_STATUS_LABEL[check.status]}</h1>
          </div>
          {check.status === "verifying" && <LiveDot intervalSeconds={POLL_SECONDS} />}
        </div>
      </div>

      {check.status === "awaiting_tx" &&
        (tester && check.checkAmountZat != null ? (
          <>
            <section className="rounded-xl border border-accent bg-surface p-6 shadow-card">
              <h2 className="text-sm font-semibold">Send exactly this amount to your {service.name} deposit address</h2>
              <p className="mt-4 font-mono text-4xl font-semibold tabular-nums tracking-tight">
                {zecExact(check.checkAmountZat)} <span className="text-lg text-muted">{unit}</span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <CopyButton value={zecExact(check.checkAmountZat)} label="amount" />
                <span className="text-xs text-subtle">Only you can see this amount. It ties the payment to this check.</span>
              </div>
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted">
                <li>Send from your shielded balance, from the wallet you named ({check.wallet}).</li>
                {check.addressType === "tex" && <li>This is a TEX address: your wallet sends in two steps. Give us the txid of the second step.</li>}
                {(check.addressType === "unified" || check.addressType === "sapling") && (
                  <li>A shielded deposit stays shielded, so we can only check where the money came from, not where it went. Your screenshot carries the rest.</li>
                )}
                <li>
                  You have <Countdown until={check.expiresAt.toISOString()} /> to send it and paste the txid.
                </li>
              </ul>
            </section>
            <section className="rounded-xl border border-line bg-surface p-6 shadow-card">
              <TxidForm checkId={check.id} />
            </section>
            <details className="rounded-xl border border-line bg-surface p-4 shadow-card">
              <summary className="cursor-pointer text-sm font-semibold">My wallet couldn&apos;t pay this address</summary>
              <WalletRefusedForm checkId={check.id} wallet={check.wallet} />
            </details>
          </>
        ) : (
          <Panel tone="neutral" icon={<Hourglass aria-hidden="true" className="size-5" />} title="Waiting for the tester to send the deposit">
            <p className="text-sm text-muted">Only the browser that started this check can see its amount and add the transaction.</p>
          </Panel>
        ))}

      {check.status === "verifying" && (
        <Panel tone="neutral" icon={<Hourglass aria-hidden="true" className="size-5" />} title="Checking the payment on-chain">
          <p className="text-sm text-muted">
            Our scanner looks the transaction up on an independent explorer and checks the amount, the address and that the money came from a
            shielded pool. It needs {NETWORKS[network].requiredConfirmations} confirmation{NETWORKS[network].requiredConfirmations > 1 ? "s" : ""}, so
            this can take {network === "mainnet" ? "around 15 minutes" : "a few minutes"}. This page updates by itself.
          </p>
        </Panel>
      )}

      {check.status === "onchain_ok" && (
        <Panel tone="ok" icon={<BadgeCheck aria-hidden="true" className="size-5" />} title="The payment checks out on-chain">
          {check.destinationChecked === false && (
            <p className="text-sm text-muted">
              Your deposit address keeps a shielded payment shielded, so we could check where the money came from, but not the amount or where it
              went. Your screenshot carries that part.
            </p>
          )}
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-subtle">Came from</dt>
              <dd className="font-medium">{check.source ? DEPOSIT_SOURCE_LABEL[check.source] : "A shielded pool"}</dd>
            </div>
            <div>
              <dt className="text-xs text-subtle">Landed on-chain</dt>
              {/* The exact time only for the tester: with the pool it could narrow down the block. Others get the day. */}
              <dd className="font-medium tabular-nums">{check.blockTime ? (tester ? utc(check.blockTime) : check.blockTime.toISOString().slice(0, 10)) : "Time not recorded"}</dd>
            </div>
          </dl>
          {tester ? (
            <ReportForm checkId={check.id} serviceName={service.name} canSayNotCredited={canReportNotCredited(check.blockTime ?? check.updatedAt)} />
          ) : (
            <p className="text-sm text-muted">Waiting for the tester to report whether {service.name} credited it.</p>
          )}
        </Panel>
      )}

      {(check.status === "reported" || check.status === "published") && check.result && (
        <Panel tone={check.result === "credited" ? "ok" : "warn"} icon={<BadgeCheck aria-hidden="true" className="size-5" />} title={DEPOSIT_RESULT_LABEL[check.result]}>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-subtle">Came from</dt>
              <dd className="font-medium">{check.source ? DEPOSIT_SOURCE_LABEL[check.source] : "Not recorded"}</dd>
            </div>
            {toCredit && (
              <div>
                <dt className="text-xs text-subtle">Credited after landing on-chain</dt>
                <dd className="font-medium">{toCredit}</dd>
              </div>
            )}
          </dl>
          <p className="text-sm text-muted">
            {check.status === "reported"
              ? "A maintainer reviews the screenshot, then the result is published and the private details are deleted."
              : "Published on the board. The private details of this check have been deleted."}
          </p>
        </Panel>
      )}

      {check.status === "refused" && (
        <Panel tone="bad" icon={<ShieldAlert aria-hidden="true" className="size-5" />} title="The on-chain check didn't pass">
          <p className="text-sm text-muted">{check.refusedReason}</p>
          <Link href={`${base}/test/deposit?service=${service.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-accent-ink hover:underline">
            Start a new check <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Panel>
      )}

      {check.status === "wallet_refused" && (
        <Panel tone="warn" icon={<TriangleAlert aria-hidden="true" className="size-5" />} title={`${check.wallet} couldn't pay this ${DEPOSIT_ADDRESS_LABEL[check.addressType]} address`}>
          <p className="text-sm text-muted">Recorded. A maintainer reviews it before it shows on the board.</p>
        </Panel>
      )}

      {check.status === "expired" && (
        <Panel tone="warn" icon={<Hourglass aria-hidden="true" className="size-5" />} title="Expired">
          <p className="text-sm text-muted">This check ran out of time. Start a new one if you still want to test {service.name}.</p>
          <Link href={`${base}/test/deposit?service=${service.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-accent-ink hover:underline">
            Start a new check <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Panel>
      )}

      <Link href={`${base}/services/${service.slug}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        All evidence for {service.name} <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
  );
}
