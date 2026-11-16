// The embeddable "Before you send" card as one self-contained HTML page:
// inline styles, no script, no fonts or files from other sites. Every value
// from the database is escaped. Pure, so it can be unit tested.
import { MARK_CHECK, MARK_SHIELD, BRAND } from "./brand";
import { shortDate } from "./present";
import type { EmbedSummary, EmbedTheme } from "./embed";
import icons from "./service-icons.json";

const ICONS: Record<string, string> = icons;

export function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The site's light and dark tokens (globals.css), only the ones the card uses.
// No color-scheme on purpose: a frame whose scheme differs from the host page's
// gets an opaque backdrop, which would show around the card's rounded corners.
const LIGHT = "--bg:#ffffff;--s2:#f2f1ee;--line:#e4e2dd;--fg:#18181b;--muted:#52525b;--ink:#8a5a00;--ok:#166534;--okbg:#e8f5ec;--warn:#9a3412;--warnbg:#fdf0e6;--bad:#9f1239;--badbg:#fdecef;--info:#3730a3;--infobg:#eef0fb";
const DARK = "--bg:#131315;--s2:#1b1b1e;--line:#27272a;--fg:#f4f4f5;--muted:#a1a1aa;--ink:#f4b728;--ok:#86efac;--okbg:#0f2a1a;--warn:#fdba74;--warnbg:#33200f;--bad:#fda4af;--badbg:#3a1219;--info:#a5b4fc;--infobg:#1b1d3a";

const TONE: Record<string, string> = { ok: "ok", warn: "warn", bad: "bad", info: "info" };
const OUTCOME_TONE: Record<string, keyof typeof TONE> = {
  credited: "ok",
  held_then_credited: "warn",
  documents_requested: "warn",
  rejected: "bad",
  refunded: "warn",
  held_open: "bad",
};

// Small line icons (lucide shapes), drawn in currentColor.
const svg = (d: string) =>
  `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  lock: svg('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
  ok: svg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
  bad: svg('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>'),
  warn: svg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  none: svg('<circle cx="12" cy="12" r="10" stroke-dasharray="3 3"/>'),
  live: svg('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),
  flask: svg('<path d="M10 2v7.31M14 9.3V2M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0M5.52 16h12.96"/>'),
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function row(tone: string, icon: string, html: string) {
  return `<li><span class="ic t-${TONE[tone] ?? "info"}">${icon}</span><span>${html}</span></li>`;
}

export function renderEmbedHtml(s: EmbedSummary, opts: { theme: EmbedTheme; now?: Date }): string {
  const now = opts.now ?? new Date();
  const name = escapeHtml(s.service.name);
  const iconPath = ICONS[s.service.slug];
  const logo = iconPath
    ? `<img src="${escapeHtml(iconPath)}" alt="" width="18" height="18" class="svc">`
    : `<span class="svc mono" aria-hidden="true">${escapeHtml((s.service.name.match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase())}</span>`;

  const rows: string[] = [];
  // Live status first, only when fresh and at least one side is known. About ZEC at all, not shielded ZEC.
  const lv = s.live;
  if (lv && lv.fresh && (lv.deposits !== "unknown" || lv.withdrawals !== "unknown")) {
    const both = lv.deposits === lv.withdrawals;
    const text = both ? `ZEC deposits and withdrawals ${lv.deposits}` : `ZEC deposits ${lv.deposits}, withdrawals ${lv.withdrawals}`;
    const tone = lv.deposits === "paused" || lv.withdrawals === "paused" ? "bad" : both && lv.deposits === "open" ? "ok" : "info";
    rows.push(row(tone, ICON.live, `Right now: <b>${escapeHtml(text)}</b> <span class="m">(${escapeHtml(lv.source)}; not about shielded support)</span>`));
  }
  if (s.deposit) {
    const d = s.deposit;
    const day = shortDate(new Date(`${d.date}T12:00:00Z`), now);
    rows.push(
      row(
        d.ok ? "ok" : "warn",
        ICON.lock,
        `Our deposit check: <b>${escapeHtml(d.label)}</b>${d.credit ? `, ${escapeHtml(d.credit)}` : ""} <span class="m">(${escapeHtml(day)}, to ${escapeHtml(d.to)} address, checked on-chain)</span>`,
      ),
    );
  }
  const o = s.outcomes;
  if (o.latest) {
    const tone = OUTCOME_TONE[o.latest.result] ?? "info";
    rows.push(
      row(
        tone,
        tone === "ok" ? ICON.ok : tone === "bad" ? ICON.bad : ICON.warn,
        `Latest report: <b>${escapeHtml(o.latest.label)}</b> <span class="m">(${escapeHtml(o.latest.week)}). ${escapeHtml(plural(o.total, "report"))}${o.trouble > 0 ? `, ${escapeHtml(o.trouble)} with a hold, refusal or refund` : ""}.</span>`,
      ),
    );
  } else {
    rows.push(row("info", ICON.none, `<span class="m">No reports yet of what happened after sending shielded ZEC here.</span>`));
  }
  // The card is sized for three rows; the tip gives way when all three facts are there.
  if (rows.length < 3) rows.push(row("info", ICON.flask, "Send a small test amount first."));

  const themeCss =
    opts.theme === "light"
      ? `:root{${LIGHT}}`
      : opts.theme === "dark"
        ? `:root{${DARK}}`
        : `:root{${LIGHT}}@media (prefers-color-scheme:dark){:root{${DARK}}}`;

  const link = (href: string, text: string) => `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Before you send shielded ZEC to ${name} · ${escapeHtml(BRAND.compact)}</title>
<style>${themeCss}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;background:transparent}
body{font:14px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--fg)}
.card{min-height:100%;display:flex;flex-direction:column;background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
h1{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--ink)}
h1 .n{display:inline-flex;align-items:center;gap:6px;letter-spacing:0;text-transform:none;font-size:14px;color:var(--fg)}
.svc{width:18px;height:18px;border-radius:4px;background:#fff;border:1px solid var(--line);object-fit:contain}
.mono{display:inline-grid;place-items:center;background:var(--s2);color:var(--muted);font-size:10px;letter-spacing:0}
ul{list-style:none;margin:10px 0 11px;display:grid;gap:7px}
li{display:flex;gap:9px;align-items:flex-start}
.ic{flex:none;width:22px;height:22px;border-radius:6px;display:grid;place-items:center;margin-top:-1px}
.t-ok{background:var(--okbg);color:var(--ok)}.t-warn{background:var(--warnbg);color:var(--warn)}.t-bad{background:var(--badbg);color:var(--bad)}.t-info{background:var(--infobg);color:var(--info)}
b{font-weight:600}.m{color:var(--muted)}
@media (max-width:420px){body{font-size:13px}.card{padding:12px 13px}}
.f{margin-top:auto;padding-top:9px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;font-size:12px;color:var(--muted)}
.f span{display:inline-flex;align-items:center;gap:5px}
a{color:var(--ink);font-weight:500;text-decoration:none}a:hover{text-decoration:underline}
</style></head>
<body><main class="card">
<h1>Before you send shielded ZEC to <span class="n">${logo}${name}</span></h1>
<ul>${rows.join("")}</ul>
<div class="f"><span><svg viewBox="0 0 32 32" width="14" height="14" aria-hidden="true"><path d="${MARK_SHIELD}" fill="#F4B728"/><path d="${MARK_CHECK}" fill="none" stroke="#18181B" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>${link(s.url, `Full record on ${escapeHtml(BRAND.compact)}`)}</span>${s.reportUrl ? link(s.reportUrl, "Sent ZEC here? Report it") : ""}</div>
</main></body></html>`;
}
