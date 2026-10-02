"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";

/** X's mark (no brand icon in lucide). Decorative: the link text says "Post on X". */
function XMark({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3Zm-1.08 16.2h1.7L7.4 4.7H5.57l11.1 14.5Z" />
    </svg>
  );
}

/**
 * "Copy link" + "Post on X" for a proof. `url` is absolute (canonical site URL);
 * `text` is a short plain-text summary. The page's Open Graph image makes the preview.
 */
export function ShareProof({ url, text, compact = false }: { url: string; text: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const intent = `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  const btn =
    "inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-medium text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-foreground";
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Share this proof">
      {!compact && <span className="text-xs text-subtle">Share this proof</span>}
      <button
        type="button"
        className={btn}
        aria-label={copied ? "Link copied" : "Copy link to this proof"}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // Clipboard blocked: the X link still carries the URL.
          }
        }}
      >
        {copied ? <Check aria-hidden="true" className="size-3.5 text-ok" /> : <Link2 aria-hidden="true" className="size-3.5" />}
        <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
      </button>
      <a href={intent} target="_blank" rel="noreferrer" className={btn}>
        <XMark className="size-3" />
        Post on X
      </a>
    </div>
  );
}
