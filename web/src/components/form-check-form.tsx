"use client";

// The withdrawal form check: paste a reference address into a service's
// withdrawal form, note what the form did, attach a screenshot. Don't submit
// the withdrawal. The server action re-validates everything.
import { useActionState, useState } from "react";
import { AlertCircle, ArrowRight } from "lucide-react";
import type { AddressType } from "@zecproof/db";
import { logFormCheck, type FormCheckState } from "@/app/actions";
import { CopyButton } from "./copy-button";

interface Props {
  services: { id: string; name: string }[];
  references: Partial<Record<AddressType, string>>;
  types: { value: AddressType; label: string; hint: string }[];
  preselected?: string;
  today: string;
}

const field = "h-11 w-full rounded-lg border border-line-strong bg-surface px-4 text-sm";
const label = "text-sm font-medium";
const hint = "text-xs text-subtle";

export function FormCheckForm({ services, references, types, preselected, today }: Props) {
  const [state, action, pending] = useActionState<FormCheckState, FormData>(logFormCheck, null);
  const [type, setType] = useState<AddressType>(types[0].value);
  const [address, setAddress] = useState(references[types[0].value] ?? "");
  const refs = Object.values(references);

  const pickType = (t: AddressType) => {
    setType(t);
    // Follow the reference address unless the tester typed their own.
    if (!address || refs.includes(address)) setAddress(references[t] ?? "");
  };

  return (
    <form action={action} className="space-y-6 rounded-xl border border-line bg-surface p-6 shadow-card">
      {state?.errors.length ? (
        <div role="alert" className="flex gap-2 rounded-lg border border-line bg-bad-soft p-4 text-sm text-bad">
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <ul className="space-y-1">
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="serviceId" className={label}>
          Service
        </label>
        <select id="serviceId" name="serviceId" required defaultValue={preselected ?? ""} className={field}>
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

      <fieldset className="space-y-2">
        <legend className={label}>Address type</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {types.map((t) => (
            <label
              key={t.value}
              className="flex cursor-pointer flex-col gap-1 rounded-lg border border-line p-4 has-[:checked]:border-accent-ink has-[:checked]:bg-surface-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-ink"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="addressType"
                  value={t.value}
                  checked={type === t.value}
                  onChange={() => pickType(t.value)}
                  className="accent-[var(--accent-ink)]"
                />
                {t.label}
              </span>
              <span className={hint}>{t.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="address" className={label}>
          Address pasted into the form
        </label>
        <div className="flex items-start gap-2">
          <textarea
            id="address"
            name="address"
            required
            rows={3}
            spellCheck={false}
            autoComplete="off"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="hash min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-4 py-2"
          />
          {address && <CopyButton value={address} label="address" />}
        </div>
        <p className={hint}>
          {references[type]
            ? "Reference address from the mainnet Trust Wallet tests. Copy it into the service's withdrawal form."
            : "No reference address of this type yet; paste the one you used."}
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className={label}>What did the form do?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { value: "form_accepted", title: "Accepted the address", sub: "The form took it. I did not submit the withdrawal." },
            { value: "address_rejected", title: "Rejected the address", sub: "The form showed an error or refused it." },
          ].map((r) => (
            <label
              key={r.value}
              className="flex cursor-pointer flex-col gap-1 rounded-lg border border-line p-4 has-[:checked]:border-accent-ink has-[:checked]:bg-surface-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-ink"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <input type="radio" name="result" value={r.value} required className="accent-[var(--accent-ink)]" />
                {r.title}
              </span>
              <span className={hint}>{r.sub}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="errorText" className={label}>
          Exact error text <span className="font-normal text-subtle">(if any)</span>
        </label>
        <textarea id="errorText" name="errorText" rows={2} maxLength={500} className="w-full rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm" />
        <p className={hint}>Copy the wording exactly, e.g. &ldquo;Invalid address format&rdquo;.</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="observedAt" className={label}>
            Date of the check
          </label>
          <input id="observedAt" name="observedAt" type="date" required defaultValue={today} max={today} className={field} />
        </div>
        <div className="space-y-2">
          <label htmlFor="evidence" className={label}>
            Screenshot
          </label>
          <input
            id="evidence"
            name="evidence"
            type="file"
            required
            accept="image/png,image/jpeg"
            className="block w-full text-sm text-muted file:mr-4 file:rounded-md file:border file:border-line-strong file:bg-surface-2 file:px-4 file:py-2 file:text-sm file:text-foreground"
          />
          <p className={hint}>PNG or JPEG, up to 4 MB. Location and other metadata are removed.</p>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="note" className={label}>
          Note <span className="font-normal text-subtle">(optional)</span>
        </label>
        <textarea id="note" name="note" rows={2} maxLength={1000} className="w-full rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm" />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-lg bg-btn px-4 py-2 text-sm font-medium text-btn-fg shadow-card transition-opacity duration-150 hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Log form check"} <ArrowRight aria-hidden="true" className="size-4" />
      </button>
    </form>
  );
}
