import { Check, X } from "lucide-react";

export const TEST_STEPS = ["Choose", "Address", "Send", "Verified"] as const;

/**
 * Numbered progress for the test flow. `current` is 0-based; `failed` marks
 * the current step as an end state (rejected / expired / failed).
 */
export function Stepper({ current, done = false, failed = false }: { current: number; done?: boolean; failed?: boolean }) {
  return (
    <div className="space-y-2">
      <ol aria-label="Test progress" className="flex w-full items-center gap-2 text-xs sm:gap-3">
      {TEST_STEPS.map((label, i) => {
        const complete = done || i < current;
        const active = !done && i === current;
        const state = complete ? "complete" : active ? (failed ? "stopped" : "current") : "upcoming";
        return (
          <li key={label} className="flex flex-1 items-center gap-2 last:flex-none sm:gap-3" aria-current={active ? "step" : undefined}>
            <span className="flex items-center gap-2">
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold tabular-nums ${
                  state === "complete"
                    ? "border-transparent bg-ok-solid text-ok-solid-fg"
                    : state === "current"
                      ? "border-accent-ink bg-surface text-accent-ink"
                      : state === "stopped"
                        ? "border-transparent bg-bad-soft text-bad"
                        : "border-line-strong bg-surface text-subtle"
                }`}
              >
                {state === "complete" ? (
                  <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                ) : state === "stopped" ? (
                  <X aria-hidden="true" className="size-3.5" strokeWidth={3} />
                ) : (
                  i + 1
                )}
              </span>
              <span className={`hidden font-medium sm:inline ${state === "upcoming" ? "text-subtle" : "text-foreground"}`}>
                {label}
                <span className="sr-only"> ({state})</span>
              </span>
            </span>
            {i < TEST_STEPS.length - 1 && <span aria-hidden="true" className={`h-px flex-1 ${complete ? "bg-ok-solid" : "bg-line"}`} />}
          </li>
        );
      })}
      </ol>
      {/* Step names are hidden on narrow screens; say where we are in words. */}
      <p aria-hidden="true" className="text-xs text-subtle sm:hidden">
        {done ? "All steps complete" : `Step ${current + 1} of ${TEST_STEPS.length} · ${TEST_STEPS[current]}${failed ? " (stopped)" : ""}`}
      </p>
    </div>
  );
}
