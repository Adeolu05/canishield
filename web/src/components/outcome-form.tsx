"use client";

// The exit outcome report: what a service did with ZEC that came out of the
// shielded pool. Only coarse facts are asked for. The server action
// re-validates everything.
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { AlertCircle, ArrowRight, ShieldCheck } from "lucide-react";
import type { OutcomeResult } from "@zecproof/db";
import { reportOutcome, type OutcomeFormState } from "@/app/outcome-actions";

type Option<T extends string = string> = { value: T; title: string; hint: string };

interface Props {
  services: { id: string; name: string }[];
  results: Option<OutcomeResult>[];
  bands: { value: string; label: string }[];
  routes: Option[];
  preselected?: string;
  today: string;
}

const field = "h-11 w-full rounded-lg border border-line-strong bg-surface px-4 text-sm";
const label = "text-sm font-medium";
const hint = "text-xs text-subtle";
const choice =
  "flex cursor-pointer flex-col gap-1 rounded-lg border border-line p-4 has-[:checked]:border-accent-ink has-[:checked]:bg-surface-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-ink";

export function OutcomeForm({ services, results, bands, routes, preselected, today }: Props) {
  const [state, action, pending] = useActionState<OutcomeFormState, FormData>(reportOutcome, null);
  const v = state?.values ?? {};
  const [result, setResult] = useState<string>(v.result ?? "");
  const held = result === "held_then_credited" || result === "held_open";

  // Submit without React's automatic reset, so a validation error never wipes the form.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };

  return (
    <form action={action} onSubmit={onSubmit} className="space-y-6 rounded-xl border border-line bg-surface p-6 shadow-card">
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
          Where did you send it?
        </label>
        <select id="serviceId" name="serviceId" required defaultValue={v.serviceId ?? preselected ?? ""} className={field}>
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
        <legend className={label}>What happened?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {results.map((r) => (
            <label key={r.value} className={choice}>
              <span className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="result"
                  value={r.value}
                  required
                  checked={result === r.value}
                  onChange={() => setResult(r.value)}
                  className="accent-[var(--accent-ink)]"
                />
                {r.title}
              </span>
              <span className={hint}>{r.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {held && (
        <div className="space-y-2">
          <label htmlFor="daysHeld" className={`block ${label}`}>
            {result === "held_open" ? "Days held so far" : "Days held before it was credited"}
          </label>
          <input id="daysHeld" name="daysHeld" type="number" inputMode="numeric" min={0} max={3650} step={1} required defaultValue={v.daysHeld} className={`${field} sm:max-w-48`} />
        </div>
      )}

      {result === "credited" && (
        <div className="space-y-2">
          <label htmlFor="creditMinutes" className={`block ${label}`}>
            Minutes until it was credited <span className="font-normal text-subtle">(optional)</span>
          </label>
          <input id="creditMinutes" name="creditMinutes" type="number" inputMode="numeric" min={0} max={43200} step={1} defaultValue={v.creditMinutes} className={`${field} sm:max-w-48`} />
          <p className={hint}>Rounded to 5 minutes.</p>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="amountBand" className={label}>
            Amount
          </label>
          <select id="amountBand" name="amountBand" required defaultValue={v.amountBand ?? ""} className={field}>
            <option value="" disabled>
              Choose a range…
            </option>
            {bands.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
          <p className={hint}>Only the range is kept, never the amount.</p>
        </div>
        <div className="space-y-2">
          <label htmlFor="sentOn" className={label}>
            When did you send it?
          </label>
          <input id="sentOn" name="sentOn" type="date" required max={today} defaultValue={v.sentOn} className={field} />
          <p className={hint}>Only the week is kept, never the day.</p>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className={label}>How did you send it?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {routes.map((r) => (
            <label key={r.value} className={choice}>
              <span className="flex items-center gap-2 text-sm font-medium">
                <input type="radio" name="route" value={r.value} defaultChecked={(v.route || "unknown") === r.value} className="accent-[var(--accent-ink)]" />
                {r.title}
              </span>
              {r.hint && <span className={hint}>{r.hint}</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="evidenceUrl" className={label}>
          Screenshot link <span className="font-normal text-subtle">(optional, for the reviewer only)</span>
        </label>
        <input id="evidenceUrl" name="evidenceUrl" type="url" inputMode="url" maxLength={500} placeholder="https://" defaultValue={v.evidenceUrl} className={field} />
        <p className={hint}>
          A support reply or your deposit history, with account details cropped out. Only the reviewer opens it, and the link is deleted after review.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="note" className={label}>
          Note <span className="font-normal text-subtle">(optional, may be shown)</span>
        </label>
        <textarea id="note" name="note" rows={3} maxLength={280} defaultValue={v.note} className="w-full rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm" />
        <p className={hint}>What the service said or asked. No addresses, transaction IDs, account names or links.</p>
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="own" value="yes" required defaultChecked={v.own === "yes"} className="mt-1 accent-[var(--accent-ink)]" />
        <span>This happened to me, and I&apos;ve left out addresses, transaction IDs and account names.</span>
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-btn px-4 py-2 text-sm font-medium text-btn-fg shadow-card transition-opacity duration-150 hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send report"} <ArrowRight aria-hidden="true" className="size-4" />
        </button>
        <p className="inline-flex items-center gap-1.5 text-xs text-subtle">
          <ShieldCheck aria-hidden="true" className="size-4" /> Reviewed before it counts. No account needed.
        </p>
      </div>
    </form>
  );
}
