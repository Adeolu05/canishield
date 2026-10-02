"use client";

// Interactive parts of the board. The search query is shared through context,
// so the server can render everything else and pass it in only as `children`.
import Link from "next/link";
import { createContext, useContext, useDeferredValue, useState, type ReactNode } from "react";
import { ArrowRight, BadgeCheck, Clock, FileText, Search, Users, X } from "lucide-react";
import type { AddressType } from "@zecproof/db";
import type { Readiness } from "@/lib/evidence";
import { READINESS_ORDER, READINESS_VISUAL, type CellView } from "@/lib/present";
import { StatusIcon, StatusLabel, TONE_TEXT } from "@/components/status";

export interface TestedRowView {
  id: string;
  slug: string;
  name: string;
  kind: string;
  href: string;
  readiness: Readiness;
  cells: Record<AddressType, CellView>;
}

export interface UntestedRowView {
  id: string;
  slug: string;
  name: string;
  kind: string;
  href: string;
  testHref: string;
  /** e.g. "Listed: transparent only", or null when no list mentions it. */
  listing: { label: string; source: string; readOn: string } | null;
}

const QueryContext = createContext<{ query: string; setQuery: (q: string) => void }>({ query: "", setQuery: () => {} });

export function BoardSearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  return <QueryContext.Provider value={{ query, setQuery }}>{children}</QueryContext.Provider>;
}

function useMatcher() {
  const q = useDeferredValue(useContext(QueryContext).query.trim().toLowerCase());
  return { q, matches: (r: { name: string; slug: string; kind: string }) => !q || r.name.toLowerCase().includes(q) || r.slug.includes(q) || r.kind.includes(q) };
}

export function BoardSearch({ placeholder }: { placeholder: string }) {
  const { query, setQuery } = useContext(QueryContext);
  return (
    <div className="relative max-w-xl">
      <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-subtle" />
      <label htmlFor="service-search" className="sr-only">
        Search services
      </label>
      <input
        id="service-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="h-12 w-full rounded-xl border border-line-strong bg-surface pl-10 pr-10 text-base shadow-card transition-colors duration-150 placeholder:text-subtle hover:border-muted"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-subtle transition-colors duration-150 hover:bg-surface-2 hover:text-foreground"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  );
}

const TIER_MARK = {
  verified: { Icon: BadgeCheck, className: "text-ok", name: "On-chain verified" },
  community: { Icon: Users, className: "text-info", name: "Community reported" },
  listing: { Icon: FileText, className: "text-listed", name: "Unverified listing" },
} as const;

function tierText(cell: CellView) {
  if (cell.tier === "none") return "";
  const parts: string[] = [TIER_MARK[cell.tier].name];
  if (cell.source) parts[0] += ` per ${cell.source}`;
  if (cell.pendingReview) parts.push("pending review");
  if (cell.dateLabel) parts.push(cell.dateLabel.replace(/^Listing read/, "read").replace(/^Reported/, "reported").replace(/^Verified/, "verified"));
  if (cell.stale) parts.push("stale, older than 30 days");
  return parts.join(" · ");
}

/** Small tier icon; its tooltip (hover or keyboard focus) gives tier, review state and date. */
function TierMark({ cell }: { cell: CellView }) {
  if (cell.tier === "none") return null;
  const { Icon, className } = TIER_MARK[cell.tier];
  const text = tierText(cell);
  return (
    <span className="group/tip relative inline-flex">
      <span
        tabIndex={0}
        role="img"
        aria-label={text}
        className={`grid size-5 place-items-center rounded ${className}`}
      >
        <Icon aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 w-max max-w-[min(20rem,calc(100vw-2rem))] rounded-md bg-btn px-2 py-1 text-[11px] leading-4 text-btn-fg opacity-0 shadow-card transition-opacity duration-150 group-focus-within/tip:opacity-100 group-hover/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

/** One primary line (icon + label + tier mark); a muted date only for verified and reported results. */
function Cell({ cell }: { cell: CellView }) {
  if (cell.tier === "none") {
    return <StatusLabel icon="circle-dashed" tone="neutral" label="Untested" className="font-normal" />;
  }
  const dated = cell.tier !== "listing";
  return (
    <div>
      <div className="flex items-center gap-2">
        <StatusLabel icon={cell.icon} tone={cell.tone} label={cell.label} />
        <TierMark cell={cell} />
      </div>
      {dated && (
        <div className="mt-1 flex items-center gap-2 pl-6 text-xs text-subtle tabular-nums">
          <time dateTime={cell.dateIso}>{cell.dateLabel?.replace(/^(Verified|Reported) /, "")}</time>
          {cell.stale && (
            <span className="inline-flex items-center gap-1 text-stale">
              <Clock aria-hidden="true" className="size-3" /> Stale
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ReadinessTag({ readiness }: { readiness: Readiness }) {
  const v = READINESS_VISUAL[readiness];
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${TONE_TEXT[v.tone]}`}>
      <StatusIcon icon={v.icon} className="size-3.5" />
      {v.label}
    </span>
  );
}

const COLUMNS: { type: AddressType; label: string; hint: string }[] = [
  { type: "ironwood_ua", label: "Ironwood-only UA", hint: "shielded receiver only" },
  { type: "full_ua", label: "Full UA", hint: "shielded + transparent" },
  { type: "transparent", label: "Transparent", hint: "t-address" },
];

export function TestedMatrix({ rows }: { rows: TestedRowView[] }) {
  const { q, matches } = useMatcher();
  const rank = (r: Readiness) => READINESS_ORDER.indexOf(r);
  const shown = rows.filter(matches).sort((a, b) => rank(a.readiness) - rank(b.readiness) || a.name.localeCompare(b.name));

  return (
    <section aria-labelledby="tested-title" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="tested-title" className="text-lg font-semibold tracking-tight">
          Tested <span className="font-normal text-subtle tabular-nums">· {shown.length}</span>
        </h2>
        <p className="text-xs text-subtle">On-chain verified results and community reports</p>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-6 py-8 text-center text-sm text-muted">
          {q ? `No tested service matches “${q}”.` : "Nothing has been tested on this board yet."}
        </p>
      ) : (
        <>
          {/* Wide screens: the page scrolls; the header row sticks under the site header. */}
          <table className="hidden w-full border-separate border-spacing-0 rounded-xl border border-line bg-surface text-left text-sm shadow-card lg:table">
            <thead>
              <tr>
                <th scope="col" className="sticky top-14 z-20 w-[28%] rounded-tl-xl border-b border-line bg-surface-2 px-4 py-2 text-xs font-medium text-muted">
                  Service
                </th>
                {COLUMNS.map((c, i) => (
                  <th
                    key={c.type}
                    scope="col"
                    className={`sticky top-14 z-20 border-b border-line bg-surface-2 px-4 py-2 text-xs font-medium text-muted ${i === COLUMNS.length - 1 ? "rounded-tr-xl" : ""}`}
                  >
                    <span className="text-foreground">{c.label}</span> <span className="font-normal text-subtle">· {c.hint}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.slug} className="group transition-colors duration-150 hover:bg-surface-2/60">
                  <th scope="row" className="border-b border-line px-4 py-4 align-top font-normal group-last:border-b-0">
                    <Link href={r.href} className="font-medium underline-offset-4 hover:underline">
                      {r.name}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-xs capitalize text-subtle">{r.kind}</span>
                      <ReadinessTag readiness={r.readiness} />
                    </div>
                  </th>
                  {COLUMNS.map((c) => (
                    <td key={c.type} className="border-b border-line px-4 py-4 align-top group-last:border-b-0">
                      <Cell cell={r.cells[c.type]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Narrow screens: one card per service. */}
          <ul className="space-y-4 lg:hidden">
            {shown.map((r) => (
              <li key={r.slug} className="rounded-xl border border-line bg-surface p-4 shadow-card">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link href={r.href} className="font-medium underline-offset-4 hover:underline">
                      {r.name}
                    </Link>
                    <div className="text-xs capitalize text-subtle">{r.kind}</div>
                  </div>
                  <ReadinessTag readiness={r.readiness} />
                </div>
                <dl className="mt-4 divide-y divide-line border-t border-line">
                  {COLUMNS.map((c) => (
                    <div key={c.type} className="grid grid-cols-[8rem_1fr] gap-4 py-2">
                      <dt className="pt-0.5 text-xs text-muted">{c.label}</dt>
                      <dd>
                        <Cell cell={r.cells[c.type]} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function UntestedList({ rows, note }: { rows: UntestedRowView[]; note?: string }) {
  const { q, matches } = useMatcher();
  const shown = rows.filter(matches);
  return (
    <section aria-labelledby="untested-title" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="untested-title" className="text-lg font-semibold tracking-tight">
          Not yet tested <span className="font-normal text-subtle tabular-nums">· {shown.length}</span>
        </h2>
        <p className="text-xs text-subtle">{note ?? "Listings are other people's claims; a test turns them into evidence"}</p>
      </div>
      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-6 py-8 text-center text-sm text-muted">
          {q ? `No untested service matches “${q}”.` : "Every service on this board has been tested."}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line bg-surface shadow-card">
          {shown.map((r) => (
            <li
              key={r.slug}
              className="grid gap-2 px-4 py-4 transition-colors duration-150 hover:bg-surface-2/60 sm:grid-cols-[minmax(10rem,14rem)_1fr_auto] sm:items-center sm:gap-6 sm:py-2"
            >
              <div className="flex items-baseline gap-2">
                <Link href={r.href} className="font-medium underline-offset-4 hover:underline">
                  {r.name}
                </Link>
                <span className="text-xs capitalize text-subtle">{r.kind}</span>
              </div>
              <p className="flex items-center gap-2 text-sm text-listed" title={r.listing ? `Unverified listing per ${r.listing.source}, read ${r.listing.readOn}` : undefined}>
                <FileText aria-hidden="true" className="size-4 shrink-0" />
                {r.listing ? (
                  <span>
                    {r.listing.label} <span className="text-subtle">· per {r.listing.source}</span>
                  </span>
                ) : (
                  <span className="text-subtle">Not in any listing</span>
                )}
              </p>
              <Link
                href={r.testHref}
                className="inline-flex items-center gap-1 justify-self-start text-sm font-medium text-accent-ink underline-offset-4 transition-colors duration-150 hover:underline sm:justify-self-end"
              >
                Help test this <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
