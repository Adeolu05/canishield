// Published deposit checks for a service page: the "On-chain checked (private)" tier.
import Link from "next/link";
import { ArrowDownToLine, Lock } from "lucide-react";
import { DEPOSIT_ADDRESS_LABEL, DEPOSIT_RESULT_LABEL, DEPOSIT_SOURCE_LABEL } from "@/lib/deposit-core";
import type { PublishedDeposit } from "@/lib/deposit-checks";
import { shortDate } from "@/lib/present";
import { formatDuration } from "@/lib/timing";

const RESULT_TONE: Record<string, string> = {
  credited: "bg-ok-soft text-ok",
  held_for_review: "bg-warn-soft text-warn",
  not_credited_24h: "bg-bad-soft text-bad",
  wallet_refused: "bg-bad-soft text-bad",
};

export function DepositResults({ deposits, base, serviceId, open, now }: { deposits: PublishedDeposit[]; base: string; serviceId: string; open: boolean; now: Date }) {
  if (deposits.length === 0 && !open) return null;
  return (
    <section className="space-y-4" aria-labelledby="deposits-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="deposits-title" className="text-base font-semibold">
          Deposits from a shielded wallet
        </h2>
        <p className="text-xs text-subtle">on-chain checked, privately: the payment was verified by our scanner but its txid isn&apos;t published</p>
      </div>
      {deposits.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">No deposit checks yet.</p>
      ) : (
        <ul className="space-y-4">
          {deposits.map((d) => {
            const toCredit = d.creditedAt && d.blockTime ? formatDuration(Math.max(0, d.creditedAt.getTime() - d.blockTime.getTime())) : null;
            return (
              <li key={d.id} className="rounded-xl border border-line bg-surface p-4 shadow-card">
                <div className="flex flex-wrap items-center gap-2">
                  {d.result && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${RESULT_TONE[d.result]}`}>{DEPOSIT_RESULT_LABEL[d.result]}</span>}
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                    <Lock aria-hidden="true" className="size-3" /> On-chain checked (private)
                  </span>
                  {d.afterNu7 != null && <span className="text-xs text-subtle">{d.afterNu7 ? "after NU7" : "before NU7"}</span>}
                </div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-subtle">Deposit address</dt>
                    <dd>{DEPOSIT_ADDRESS_LABEL[d.addressType]}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-subtle">Sent from</dt>
                    <dd>
                      {d.wallet}
                      {d.source && <span className="block text-xs text-muted">{DEPOSIT_SOURCE_LABEL[d.source]}</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-subtle">Time to credit</dt>
                    <dd>
                      {toCredit ?? "Not applicable"}
                      {d.confirmationsShown != null && <span className="block text-xs text-muted">{d.confirmationsShown} confirmations shown</span>}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-subtle">
                  {d.blockTime ? `Checked ${shortDate(d.blockTime, now)}` : "Checked"}
                  {d.reviewedAt ? ` · credit screenshot reviewed ${shortDate(d.reviewedAt, now)}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-medium text-subtle hover:text-foreground">What is a TEX address?</summary>
        <p className="mt-2 text-muted">
          A TEX address (tex1…, ZIP 320) is a transparent-only deposit address. Wallets that support it pay it in two steps: from your
          shielded balance to a one-time transparent address, then on to the service. Wallets without TEX support can&apos;t pay it at all.
        </p>
      </details>
      {open && (
        <Link href={`${base}/test/deposit?service=${serviceId}`} className="inline-flex items-center gap-2 text-sm font-medium text-accent-ink underline-offset-4 hover:underline">
          <ArrowDownToLine aria-hidden="true" className="size-4" /> Check a deposit
        </Link>
      )}
    </section>
  );
}
