import Link from "next/link";
import { notFound } from "next/navigation";
import { markAddressRejected } from "@/app/actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { OutcomeBadge, TierBadge } from "@/components/badges";
import { ADDRESS_TYPE_LABEL, STATUS_LABEL } from "@/lib/labels";
import { NETWORKS, basePath, formatAmount, type NetworkId } from "@/lib/network";
import { getTest } from "@/lib/queries";

export async function TestStatusView({ network, id }: { network: NetworkId; id: string }) {
  const row = await getTest(network, id);
  if (!row) notFound();
  const { test, service } = row;
  const profile = NETWORKS[network];
  const live = test.status === "pending" || test.status === "awaiting_payment" || test.status === "confirming";

  return (
    <div className="max-w-2xl space-y-6">
      {live && <AutoRefresh />}
      <div>
        <p className="text-sm text-zinc-500">
          {service.name} · {ADDRESS_TYPE_LABEL[test.addressType]}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{STATUS_LABEL[test.status]}</h1>
      </div>

      {test.status === "pending" && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          The scanner is preparing a fresh address. This page refreshes automatically.
          {test.error && <span className="mt-2 block text-xs text-rose-600">{test.error}</span>}
        </p>
      )}

      {test.status === "awaiting_payment" && test.receiveAddress && (
        <div className="space-y-4">
          <p className="text-sm">
            Withdraw from <strong>{service.name}</strong> to this address:
          </p>
          <pre className="whitespace-pre-wrap break-all rounded-lg bg-zinc-100 p-4 font-mono text-sm dark:bg-zinc-900">
            {test.receiveAddress}
          </pre>
          <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <p>
              <strong className="font-medium">Privacy:</strong> this address and its viewing key are published with the
              result. If you withdraw from an account in your name, the service knows the withdrawal was yours, and
              anyone can see that this address received it.
            </p>
            <p>
              <strong className="font-medium">Test funds aren&apos;t returned.</strong> Send the smallest amount of{" "}
              {profile.unit} the service allows.
            </p>
          </div>
          <p className="text-xs text-zinc-500">
            Watching from block {test.birthdayHeight}; last scanned {test.scannedToHeight}. Expires{" "}
            {test.expiresAt?.toISOString().replace("T", " ").slice(0, 16)} UTC.
          </p>
          {test.error && <p className="text-xs text-rose-600">Scanner error (will retry): {test.error}</p>}
          <form action={markAddressRejected.bind(null, test.id)} className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <p className="text-sm font-medium">Did the service refuse this address?</p>
            <p className="text-xs text-zinc-500">
              This can&apos;t be proven on-chain, so it is filed as a community report and reviewed.
            </p>
            <input
              name="note"
              placeholder="Optional: the error message it showed"
              className="w-full rounded-md border border-zinc-300 bg-background px-3 py-2 text-sm dark:border-zinc-700"
            />
            <input
              name="evidenceUrl"
              type="url"
              placeholder="Optional: link to a screenshot (https://…)"
              className="w-full rounded-md border border-zinc-300 bg-background px-3 py-2 text-sm dark:border-zinc-700"
            />
            <button type="submit" className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">
              Mark address as rejected
            </button>
          </form>
        </div>
      )}

      {(test.status === "confirming" || test.status === "received") && test.receivedPool && (
        <div className="space-y-2 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <p className="flex flex-wrap items-center gap-2">
            Landed in <OutcomeBadge outcome={test.receivedPool} />
            {test.receivedAmountZat != null && <> · {formatAmount(test.receivedAmountZat, network)}</>} · block{" "}
            {test.receivedHeight}
            {test.status === "received" && <TierBadge tier="verified" />}
          </p>
          <p className="break-all font-mono text-xs">{test.receivedTxid}</p>
          {test.status === "confirming" && (
            <p className="text-xs text-zinc-500">
              Waiting for {profile.requiredConfirmations} confirmation{profile.requiredConfirmations > 1 ? "s" : ""}
              {profile.requireExplorerCheck && " and an independent block explorer check"} before this counts as verified.
              {test.error && <span className="mt-1 block">{test.error}</span>}
            </p>
          )}
          {test.explorerName && <p className="text-xs text-zinc-500">Confirmed on {test.explorerName}.</p>}
        </div>
      )}

      {test.status === "address_rejected" && (
        <div className="space-y-2 rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <p className="flex flex-wrap items-center gap-2">
            <OutcomeBadge outcome="address_rejected" /> <TierBadge tier="community" />
            <span className="text-xs text-zinc-500">Filed as a community report</span>
          </p>
          <p className="break-all font-mono text-xs">{test.receiveAddress}</p>
          {test.testerNote && <p>{test.testerNote}</p>}
        </div>
      )}

      <Link href={`${basePath(network)}/services/${service.slug}`} className="inline-block text-sm hover:underline">
        View all evidence for {service.name} →
      </Link>
    </div>
  );
}
