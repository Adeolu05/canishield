"use client";

// "Share the countdown": live PNG cards in three shapes plus one-tap sharing.
// The card URL carries the blocks-left count, so every share gets a fresh image
// even on sites that cache link previews by URL.
import { useState, useSyncExternalStore } from "react";
import { Check, Download, Link2, Share2 } from "lucide-react";
import { XMark } from "./share";
import { useNu7 } from "./nu7-live";
import { NU7_HEIGHT, formatRemaining } from "@/lib/nu7";

const FORMATS = [
  { id: "wide", label: "Wide", use: "X, LinkedIn, Facebook", w: 1200, h: 630 },
  { id: "square", label: "Square", use: "Instagram feed", w: 1080, h: 1080 },
  { id: "story", label: "Story", use: "Instagram and WhatsApp status, TikTok", w: 1080, h: 1920 },
] as const;
type FormatId = (typeof FORMATS)[number]["id"];

const noop = () => () => {};
const useCanShare = () => useSyncExternalStore(noop, () => typeof navigator !== "undefined" && typeof navigator.share === "function", () => false);

export function Nu7Share({ siteUrl }: { siteUrl: string }) {
  const { state, remainingMs, overdue } = useNu7();
  const [format, setFormat] = useState<FormatId>("wide");
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const canShare = useCanShare();

  const key = state.phase === "upcoming" ? String(state.blocksLeft) : state.phase;
  const pageUrl = `${siteUrl}/nu7?b=${key}`;
  const cardPath = `/nu7/card?f=${format}&b=${key}`;
  const text =
    state.phase === "upcoming"
      ? overdue
        ? `Zcash NU7 activates any moment now, at block ${NU7_HEIGHT.toLocaleString("en-US")}. Is your ZEC ready?`
        : `Zcash NU7 activates in about ${formatRemaining(remainingMs)} (${state.blocksLeft.toLocaleString("en-US")} blocks to go). Is your ZEC ready?`
      : state.phase === "live"
        ? "NU7 is live on Zcash. Here's what changed and what to check:"
        : `Zcash NU7 activates at block ${NU7_HEIGHT.toLocaleString("en-US")}. Is your ZEC ready?`;
  const e = encodeURIComponent;
  const links = [
    { label: "Post on X", href: `https://x.com/intent/post?text=${e(text)}&url=${e(pageUrl)}`, icon: <XMark className="size-3.5" /> },
    { label: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${e(pageUrl)}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${e(pageUrl)}` },
    { label: "WhatsApp", href: `https://wa.me/?text=${e(`${text} ${pageUrl}`)}` },
    { label: "Telegram", href: `https://t.me/share/url?url=${e(pageUrl)}&text=${e(text)}` },
    { label: "Reddit", href: `https://www.reddit.com/submit?url=${e(pageUrl)}&title=${e(text)}` },
  ];
  const f = FORMATS.find((x) => x.id === format)!;
  const btn =
    "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium transition-colors duration-150 hover:border-line-strong hover:bg-surface-2";

  async function nativeShare() {
    setSharing(true);
    try {
      const blob = await fetch(cardPath).then((r) => r.blob());
      const file = new File([blob], `zcash-nu7-${format}.png`, { type: "image/png" });
      const data: ShareData = navigator.canShare?.({ files: [file] }) ? { files: [file], text: `${text} ${pageUrl}` } : { text, url: pageUrl };
      await navigator.share(data);
    } catch {
      // Cancelled or unsupported: nothing to do, the other buttons still work.
    } finally {
      setSharing(false);
    }
  }

  return (
    <section aria-labelledby="share-title" className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="space-y-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent-ink">Spread the word</p>
          <h2 id="share-title" className="mt-2 text-2xl font-semibold tracking-tight">
            Share the live countdown
          </h2>
          <p className="mt-2 text-muted">These cards are drawn live from our scanner, so the count is current whenever someone opens your post.</p>
        </div>
        <div role="tablist" aria-label="Card shape" className="inline-flex rounded-lg border border-line bg-surface p-1">
          {FORMATS.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={format === x.id}
              onClick={() => setFormat(x.id)}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors duration-150 ${format === x.id ? "bg-btn text-btn-fg" : "text-muted hover:text-foreground"}`}
            >
              {x.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-subtle">
          {f.label} card, {f.w}×{f.h}: for {f.use}.
        </p>
        <div className={`overflow-hidden rounded-2xl border border-line bg-[#0b0a08] ${format === "story" ? "mx-auto max-w-[18rem]" : format === "square" ? "max-w-md" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a live PNG from our own route, not a static asset */}
          <img key={cardPath} src={cardPath} alt={`${f.label} share card: ${text}`} width={f.w} height={f.h} className="block h-auto w-full" />
        </div>
      </div>

      <div className="space-y-4 lg:pt-28">
        {canShare && (
          <button type="button" onClick={nativeShare} disabled={sharing} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-6 text-sm font-semibold text-[#18181b] transition-[filter] duration-150 hover:brightness-105 disabled:opacity-70">
            <Share2 aria-hidden="true" className="size-4" /> {sharing ? "Opening…" : "Share card"}
          </button>
        )}
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Share on">
          {links.map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className={btn}>
              {l.icon}
              {l.label}
            </a>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <a href={cardPath} download={`zcash-nu7-${format}.png`} className={btn}>
            <Download aria-hidden="true" className="size-4" /> Download
          </a>
          <button
            type="button"
            className={btn}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(pageUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                // Clipboard blocked: the share buttons still carry the link.
              }
            }}
          >
            {copied ? <Check aria-hidden="true" className="size-4 text-ok" /> : <Link2 aria-hidden="true" className="size-4" />}
            <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
          </button>
        </div>
        <p className="text-xs text-subtle">For Instagram, TikTok and status updates, download the Square or Story card and post it with the link.</p>
      </div>
    </section>
  );
}
