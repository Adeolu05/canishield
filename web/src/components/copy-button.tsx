"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copies a public value (txid, address, viewing key). Announces success to screen readers. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard blocked (e.g. insecure context): the value is still selectable on the page.
        }
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-1.5 py-1 text-xs text-muted hover:bg-surface-2 hover:text-foreground"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
    >
      {copied ? <Check aria-hidden="true" className="size-3.5 text-ok" /> : <Copy aria-hidden="true" className="size-3.5" />}
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
