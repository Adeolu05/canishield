"use client";

import { useFormStatus } from "react-dom";
import { ArrowRight } from "lucide-react";

/** A submit button that can't be pressed again while its form is being sent. */
export function SubmitOnce({ label, busyLabel, className }: { label: string; busyLabel: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={className}>
      {pending ? busyLabel : label} <ArrowRight aria-hidden="true" className="size-4" />
    </button>
  );
}
