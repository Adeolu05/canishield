"use client";

// Deposit check forms. The address preview decodes in the browser, so the
// tester sees what kind of address it is before anything is sent.
import { startTransition, useActionState, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { AlertCircle, ArrowRight, Info } from "lucide-react";
import { DepositAddressError, decodeDepositAddress } from "@zecproof/zcash/deposit";
import type { NetworkId } from "@zecproof/zcash/networks";
import { createDepositCheck, markWalletRefused, reportDepositResult, submitDepositTxid, type DepositFormState } from "@/app/deposit-actions";

/**
 * Submits through the action without React's automatic form reset, so a
 * validation error never wipes what the tester typed. `before` can fill hidden
 * fields first (e.g. the timezone offset).
 */
function submitWithoutReset(action: (fd: FormData) => void, before?: (form: HTMLFormElement) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    before?.(e.currentTarget);
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

const field = "h-11 w-full rounded-lg border border-line-strong bg-surface px-4 text-sm";
const primary =
  "inline-flex items-center gap-2 rounded-lg bg-btn px-4 py-2 text-sm font-medium text-btn-fg shadow-card transition-opacity duration-150 hover:opacity-90 disabled:opacity-60";

function ErrorLine({ state }: { state: DepositFormState }) {
  if (!state?.error) return null;
  return (
    <p role="alert" className="flex gap-2 rounded-lg bg-bad-soft p-2 text-sm text-bad">
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      {state.error}
    </p>
  );
}

export function DepositStartForm({ network, unit, services, preselected }: { network: NetworkId; unit: string; services: { id: string; name: string }[]; preselected?: string }) {
  const [state, action, pending] = useActionState(createDepositCheck, null);
  // Controlled, so they survive the form reset React does after every action.
  const [address, setAddress] = useState("");
  const [serviceId, setServiceId] = useState(preselected ?? "");
  const preview = useMemo(() => {
    if (!address.trim()) return null;
    try {
      return { ok: true as const, d: decodeDepositAddress(address, network) };
    } catch (e) {
      return { ok: false as const, error: e instanceof DepositAddressError ? e.message : "That address couldn't be read." };
    }
  }, [address, network]);

  return (
    <form onSubmit={submitWithoutReset(action)} className="space-y-6 rounded-xl border border-line bg-surface p-6 shadow-card">
      <input type="hidden" name="network" value={network} />
      <ErrorLine state={state} />
      <div className="space-y-2">
        <label htmlFor="serviceId" className="text-sm font-medium">
          Service you&apos;re depositing into
        </label>
        <select id="serviceId" name="serviceId" required value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={field}>
          <option value="" disabled>
            Choose a service…
          </option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <label htmlFor="address" className="text-sm font-medium">
          The deposit address the service shows you
        </label>
        <input
          id="address"
          name="address"
          required
          autoComplete="off"
          spellCheck={false}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className={`${field} font-mono`}
          aria-describedby="address-help"
        />
        <p id="address-help" className="text-xs text-subtle">
          We only keep its kind and a keyed hash, never the address itself, and nothing about it is published except its kind.
        </p>
        {preview && (
          <p role="status" className={`flex gap-2 rounded-lg p-2 text-sm ${preview.ok ? "bg-surface-2 text-foreground" : "bg-bad-soft text-bad"}`}>
            {preview.ok ? <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent-ink" /> : <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
            {preview.ok ? preview.d.label : preview.error}
          </p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="base" className="text-sm font-medium">
            Amount you&apos;ll deposit ({unit})
          </label>
          <input id="base" name="base" required inputMode="decimal" placeholder="0.01" defaultValue={state?.values?.base} className={field} aria-describedby="base-help" />
          <p id="base-help" className="text-xs text-subtle">
            At or above the service&apos;s minimum deposit. We add a few zatoshis to make the amount unique to this check.
          </p>
        </div>
        <div className="space-y-2">
          <label htmlFor="wallet" className="text-sm font-medium">
            Wallet you&apos;ll send from, with version
          </label>
          <input id="wallet" name="wallet" required maxLength={80} placeholder="e.g. Zodl 3.18" defaultValue={state?.values?.wallet} className={field} />
          <p className="text-xs text-subtle">Published with the result: TEX support depends on the wallet.</p>
        </div>
      </div>
      <button type="submit" disabled={pending || (preview != null && !preview.ok)} className={primary}>
        {pending ? "Creating…" : "Get my check amount"} <ArrowRight aria-hidden="true" className="size-4" />
      </button>
    </form>
  );
}

export function TxidForm({ checkId }: { checkId: string }) {
  const [state, action, pending] = useActionState<DepositFormState, FormData>(submitDepositTxid.bind(null, checkId), null);
  return (
    <form onSubmit={submitWithoutReset(action)} className="space-y-4">
      <ErrorLine state={state} />
      <div className="space-y-1">
        <label htmlFor="txid" className="text-sm font-medium">
          Transaction ID (txid) of the deposit
        </label>
        <input id="txid" name="txid" required autoComplete="off" spellCheck={false} placeholder="64 characters" defaultValue={state?.values?.txid} className={`${field} font-mono`} />
        <p className="text-xs text-subtle">For a two-step (TEX) deposit, the txid of the second step: the payment to the service.</p>
      </div>
      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Saving…" : "Check it on-chain"} <ArrowRight aria-hidden="true" className="size-4" />
      </button>
    </form>
  );
}

const noSubscribe = () => () => {};
const useTimeZone = () => useSyncExternalStore(noSubscribe, () => Intl.DateTimeFormat().resolvedOptions().timeZone || null, () => null);

export function ReportForm({ checkId, serviceName, canSayNotCredited }: { checkId: string; serviceName: string; canSayNotCredited: boolean }) {
  const [state, action, pending] = useActionState<DepositFormState, FormData>(reportDepositResult.bind(null, checkId), null);
  const [result, setResult] = useState<"credited" | "held_for_review" | "not_credited_24h">("credited");
  const zone = useTimeZone();
  const options = [
    { v: "credited", label: "Credited", hint: `${serviceName} added it to my balance` },
    { v: "held_for_review", label: "Held for review", hint: "The service flagged or froze it" },
    { v: "not_credited_24h", label: "Not credited after 24 hours", hint: canSayNotCredited ? "Still missing a day later" : "Available 24 hours after the payment landed", disabled: !canSayNotCredited },
  ] as const;
  return (
    <form
      onSubmit={submitWithoutReset(action, (form) => {
        // The offset for the entered moment (so daylight saving is right), set before the form data is read.
        const local = (form.elements.namedItem("creditedAtLocal") as HTMLInputElement | null)?.value;
        const offset = form.elements.namedItem("tzOffset") as HTMLInputElement | null;
        if (offset && local) offset.value = String(new Date(local).getTimezoneOffset());
      })}
      className="space-y-4"
    >
      <ErrorLine state={state} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">What happened?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {options.map((o) => (
            <label
              key={o.v}
              className={`flex flex-col gap-1 rounded-lg border border-line p-4 has-[:checked]:border-accent-ink has-[:checked]:bg-surface-2 ${"disabled" in o && o.disabled ? "opacity-50" : "cursor-pointer"}`}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="result"
                  value={o.v}
                  checked={result === o.v}
                  disabled={"disabled" in o && o.disabled}
                  onChange={() => setResult(o.v)}
                  className="accent-[var(--accent-ink)]"
                />
                {o.label}
              </span>
              <span className="text-xs text-subtle">{o.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {result === "credited" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="creditedAtLocal" className="text-xs font-medium">
              When it was credited{zone ? ` (your time, ${zone})` : " (your time)"}
            </label>
            <input id="creditedAtLocal" name="creditedAtLocal" type="datetime-local" required defaultValue={state?.values?.creditedAtLocal} className={field} />
            <input type="hidden" name="tzOffset" defaultValue="" />
          </div>
          <div className="space-y-1">
            <label htmlFor="confirmationsShown" className="text-xs font-medium">
              Confirmations the service showed (optional)
            </label>
            <input id="confirmationsShown" name="confirmationsShown" inputMode="numeric" placeholder="e.g. 10" defaultValue={state?.values?.confirmationsShown} className={field} />
          </div>
        </div>
      )}
      <div className="space-y-1">
        <label htmlFor="evidenceUrl" className="text-xs font-medium">
          Link to a screenshot of the service&apos;s deposit history
        </label>
        <input id="evidenceUrl" name="evidenceUrl" type="url" required maxLength={500} placeholder="https://…" defaultValue={state?.values?.evidenceUrl} className={field} />
        <p className="text-xs text-subtle">Seen only by the maintainer, deleted after review. Crop out account numbers, emails and balances.</p>
      </div>
      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Sending…" : "Send my report"} <ArrowRight aria-hidden="true" className="size-4" />
      </button>
    </form>
  );
}

export function WalletRefusedForm({ checkId, wallet }: { checkId: string; wallet: string }) {
  const [state, action, pending] = useActionState<DepositFormState, FormData>(markWalletRefused.bind(null, checkId), null);
  return (
    <form onSubmit={submitWithoutReset(action)} className="mt-4 space-y-4">
      <ErrorLine state={state} />
      <p className="text-xs text-subtle">
        For example, a wallet without TEX support refusing a TEX address. That&apos;s a useful result too: it&apos;s recorded for {wallet} and
        this address kind, after review.
      </p>
      <div className="space-y-1">
        <label htmlFor="refusedEvidenceUrl" className="text-xs font-medium">
          Link to a screenshot of the wallet&apos;s error
        </label>
        <input id="refusedEvidenceUrl" name="refusedEvidenceUrl" type="url" required maxLength={500} placeholder="https://…" defaultValue={state?.values?.refusedEvidenceUrl} className={field} />
        <p className="text-xs text-subtle">Seen only by the maintainer, deleted after review. Crop out anything personal.</p>
      </div>
      <button type="submit" disabled={pending} className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium transition-colors duration-150 hover:bg-surface-2 disabled:opacity-60">
        {pending ? "Saving…" : "Record that the wallet refused"}
      </button>
    </form>
  );
}
