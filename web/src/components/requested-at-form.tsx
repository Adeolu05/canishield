"use client";

// "When did you request this withdrawal?" The browser's timezone offset goes
// with the local time, so the server stores UTC. Optional and settable once.
import { useActionState, useRef, useSyncExternalStore } from "react";
import { AlertCircle } from "lucide-react";
import { setRequestedAt, type RequestedAtState } from "@/app/actions";

const field = "h-10 w-full rounded-lg border border-line-strong bg-surface px-4 text-sm";

// The browser's timezone name; null on the server, so the first client render matches it.
const noSubscribe = () => () => {};
const useTimeZone = () =>
  useSyncExternalStore(
    noSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    () => null,
  );

export function RequestedAtForm({ testId, serviceName }: { testId: string; serviceName: string }) {
  const [state, action, pending] = useActionState<RequestedAtState, FormData>(setRequestedAt.bind(null, testId), null);
  const offsetRef = useRef<HTMLInputElement>(null);
  const zone = useTimeZone();

  return (
    <form
      action={action}
      onSubmit={(e) => {
        // The offset for the entered moment (so daylight saving is right), set
        // before the form data is read.
        const local = (e.currentTarget.elements.namedItem("requestedAtLocal") as HTMLInputElement).value;
        if (offsetRef.current) offsetRef.current.value = String(new Date(local).getTimezoneOffset());
      }}
      className="mt-4 space-y-4"
    >
      <p className="text-xs text-subtle">
        Optional. We measure how long {serviceName} took: from the time you clicked withdraw to the block the payment landed in. Shown as
        reported by you; the block time comes from the chain.
      </p>
      {state?.error && (
        <p role="alert" className="flex gap-2 rounded-lg bg-bad-soft p-2 text-sm text-bad">
          <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {state.error}
        </p>
      )}
      <div className="space-y-1">
        <label htmlFor="requestedAtLocal" className="text-xs font-medium">
          When you clicked withdraw{zone ? ` (your time, ${zone})` : " (your time)"}
        </label>
        <input id="requestedAtLocal" name="requestedAtLocal" type="datetime-local" required className={field} />
        <input ref={offsetRef} type="hidden" name="tzOffset" defaultValue="" />
      </div>
      <div className="space-y-1">
        <label htmlFor="requestedEvidenceUrl" className="text-xs font-medium">
          Screenshot of the withdrawal history (optional link, seen only by you and the maintainer; crop out account details)
        </label>
        <input id="requestedEvidenceUrl" name="requestedEvidenceUrl" type="url" maxLength={500} placeholder="https://…" className={field} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-line-strong px-4 py-2 text-sm font-medium transition-colors duration-150 hover:bg-surface-2 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save request time"}
      </button>
    </form>
  );
}
