"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import type { AddressType } from "@zecproof/db";
import type { Readiness } from "@/lib/evidence";
import { READINESS_ORDER, READINESS_VISUAL, type CellView } from "@/lib/present";
import { PendingChip, StaleChip, StatusIcon, StatusLabel, TONE_SOFT, TierChip } from "@/components/status";

export interface BoardRowView {
  slug: string;
  name: string;
  kind: string;
  href: string;
  readiness: Readiness;
  strongestTier: CellView["tier"];
  cells: Record<AddressType, CellView>;
}

const COLUMNS: { type: AddressType; label: string; hint: string }[] = [
  { type: "ironwood_ua", label: "Ironwood-only UA", hint: "Shielded receiver only" },
  { type: "full_ua", label: "Full UA", hint: "Shielded + transparent" },
  { type: "transparent", label: "Transparent", hint: "t-address" },
];

const TIER_FILTERS = [
  { value: "all", label: "All" },
  { value: "verified", label: "Verified" },
  { value: "community", label: "Community" },
  { value: "listing", label: "Listing only" },
  { value: "none", label: "Untested" },
] as const;
type TierFilter = (typeof TIER_FILTERS)[number]["value"];

function Cell({ cell }: { cell: CellView }) {
  if (cell.tier === "none") {
    return <StatusLabel icon="circle-dashed" tone="neutral" label="Untested" className="text-sm font-normal" />;
  }
  return (
    <div className="flex flex-col items-start gap-1.5">
      <StatusLabel icon={cell.icon} tone={cell.tone} label={cell.label} className="text-sm" />
      <div className="flex flex-wrap items-center gap-1">
        <TierChip tier={cell.tier} />
        {cell.source && (
          <span className="text-[11px] text-subtle">
            per {cell.source} · <time dateTime={cell.dateIso}>{cell.dateLabel?.replace("Listing read", "read")}</time>
          </span>
        )}
        {cell.pendingReview && <PendingChip />}
      </div>
      {(!cell.source || cell.stale) && (
        <div className="flex items-center gap-1.5 text-xs text-subtle">
          {!cell.source && <time dateTime={cell.dateIso}>{cell.dateLabel}</time>}
          {cell.stale && <StaleChip />}
        </div>
      )}
    </div>
  );
}

function ReadinessPill({ readiness }: { readiness: Readiness }) {
  const v = READINESS_VISUAL[readiness];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${TONE_SOFT[v.tone]}`}>
      <StatusIcon icon={v.icon} className="size-3" />
      {v.label}
    </span>
  );
}

export function BoardExplorer({
  rows,
  heading,
  between,
  placeholder,
}: {
  rows: BoardRowView[];
  heading: ReactNode;
  between?: ReactNode;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<TierFilter>("all");
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState<"readiness" | "name">("readiness");
  const q = useDeferredValue(query.trim().toLowerCase());

  const kinds = useMemo(() => [...new Set(rows.map((r) => r.kind))].sort(), [rows]);
  const shown = useMemo(() => {
    const rank = (r: Readiness) => READINESS_ORDER.indexOf(r);
    return rows
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.slug.includes(q) || r.kind.includes(q))
      .filter((r) => tier === "all" || r.strongestTier === tier)
      .filter((r) => kind === "all" || r.kind === kind)
      .sort((a, b) => (sort === "readiness" ? rank(a.readiness) - rank(b.readiness) : 0) || a.name.localeCompare(b.name));
  }, [rows, q, tier, kind, sort]);
  const filtered = q !== "" || tier !== "all" || kind !== "all";
  const reset = () => {
    setQuery("");
    setTier("all");
    setKind("all");
  };

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        {heading}
        <div className="relative max-w-xl">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-subtle" />
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
            className="h-12 w-full rounded-xl border border-line-strong bg-surface pl-11 pr-10 text-base shadow-card placeholder:text-subtle"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-subtle hover:bg-surface-2 hover:text-foreground"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>
      </div>

      {between}

      <section aria-labelledby="matrix-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="matrix-title" className="text-base font-semibold">
            Services{" "}
            <span className="font-normal text-subtle" aria-live="polite">
              {shown.length === rows.length ? `(${rows.length})` : `(${shown.length} of ${rows.length})`}
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <div role="radiogroup" aria-label="Filter by evidence tier" className="flex rounded-lg border border-line bg-surface p-0.5">
              {TIER_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={tier === f.value}
                  onClick={() => setTier(f.value)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    tier === f.value ? "bg-btn text-btn-fg" : "text-muted hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              Kind
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="rounded-lg border border-line-strong bg-surface px-2 py-1 text-xs capitalize text-foreground"
              >
                <option value="all">All</option>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              Sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as "readiness" | "name")}
                className="rounded-lg border border-line-strong bg-surface px-2 py-1 text-xs text-foreground"
              >
                <option value="readiness">Readiness</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
            <p className="font-medium">{q ? `No services match “${query.trim()}”.` : "No services match these filters."}</p>
            <p className="mt-1 text-sm text-muted">Try another name, or clear the filters to see every service.</p>
            {filtered && (
              <button type="button" onClick={reset} className="mt-4 rounded-lg border border-line-strong px-3 py-1.5 text-sm hover:bg-surface-2">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop/tablet: matrix with sticky header and first column. */}
            <div className="hidden max-h-[72vh] overflow-auto rounded-xl border border-line bg-surface shadow-card md:block">
              <table className="w-full border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="sticky left-0 top-0 z-30 min-w-56 border-b border-line bg-surface-2 px-4 py-3 text-xs font-medium text-muted">
                      Service
                    </th>
                    {COLUMNS.map((c) => (
                      <th key={c.type} scope="col" className="sticky top-0 z-20 min-w-52 border-b border-line bg-surface-2 px-4 py-3 text-xs font-medium text-muted">
                        <span className="block text-foreground">{c.label}</span>
                        <span className="font-normal text-subtle">{c.hint}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.slug} className="group">
                      <th scope="row" className="sticky left-0 z-10 border-b border-line bg-surface px-4 py-3.5 align-top font-normal group-last:border-b-0 group-hover:bg-surface-2">
                        <Link href={r.href} className="font-medium text-foreground underline-offset-2 hover:underline">
                          {r.name}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="text-xs capitalize text-subtle">{r.kind}</span>
                          <ReadinessPill readiness={r.readiness} />
                        </div>
                      </th>
                      {COLUMNS.map((c) => (
                        <td key={c.type} className="border-b border-line px-4 py-3.5 align-top group-last:border-b-0 group-hover:bg-surface-2/60">
                          <Cell cell={r.cells[c.type]} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: one card per service. */}
            <ul className="space-y-3 md:hidden">
              {shown.map((r) => (
                <li key={r.slug} className="rounded-xl border border-line bg-surface p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link href={r.href} className="font-medium underline-offset-2 hover:underline">
                        {r.name}
                      </Link>
                      <div className="text-xs capitalize text-subtle">{r.kind}</div>
                    </div>
                    <ReadinessPill readiness={r.readiness} />
                  </div>
                  <dl className="mt-3 divide-y divide-line border-t border-line">
                    {COLUMNS.map((c) => (
                      <div key={c.type} className="grid grid-cols-[7.5rem_1fr] gap-3 py-2.5">
                        <dt className="text-xs text-muted">{c.label}</dt>
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
    </div>
  );
}
