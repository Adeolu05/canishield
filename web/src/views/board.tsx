import Link from "next/link";
import { ArrowRight, Braces } from "lucide-react";
import { STALE_AFTER_DAYS, type Readiness } from "@/lib/evidence";
import { basePath, canCreateTests, type NetworkId } from "@/lib/network";
import { READINESS_ORDER, READINESS_VISUAL, cellView, strongestTier } from "@/lib/present";
import { getBoard } from "@/lib/queries";
import { StaleChip, StatusIcon, StatusLabel, TONE_SOFT, TierChip } from "@/components/status";
import { BoardExplorer, type BoardRowView } from "./board-explorer";

function ReadinessTiles({ counts, total, untestedWithListing }: { counts: Record<Readiness, number>; total: number; untestedWithListing: number }) {
  // "Shielded, not Ironwood" only appears once something lands there.
  const shown = READINESS_ORDER.filter((k) => k !== "shielded_other" || counts[k] > 0);
  return (
    <section aria-labelledby="readiness-title" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="readiness-title" className="text-base font-semibold">
          Ironwood readiness
        </h2>
        <p className="text-xs text-subtle">{total} services · counted from on-chain and community evidence only</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {shown.map((k) => {
          const v = READINESS_VISUAL[k];
          return (
            <div key={k} className="rounded-xl border border-line bg-surface p-3.5 shadow-card sm:p-4">
              <dt className="flex items-center gap-2 text-sm font-medium">
                <span className={`grid size-7 place-items-center rounded-lg ${TONE_SOFT[v.tone]}`}>
                  <StatusIcon icon={v.icon} className="size-4" />
                </span>
                {v.label}
              </dt>
              <dd className="mt-2 text-3xl font-semibold tabular-nums tracking-tight sm:mt-3">{counts[k]}</dd>
              <dd className="mt-1 hidden text-xs leading-relaxed text-subtle sm:block">{v.meaning}</dd>
            </div>
          );
        })}
      </dl>
      <details className="rounded-xl border border-line bg-surface px-4 py-3 text-sm sm:hidden">
        <summary className="cursor-pointer font-medium">What do these mean?</summary>
        <dl className="mt-2 space-y-2">
          {shown.map((k) => (
            <div key={k}>
              <dt className="font-medium">{READINESS_VISUAL[k].label}</dt>
              <dd className="text-xs text-subtle">{READINESS_VISUAL[k].meaning}</dd>
            </div>
          ))}
        </dl>
      </details>
      {untestedWithListing > 0 && (
        <p className="text-xs text-subtle">
          {untestedWithListing} of the untested services appear in an unverified listing; listings don&apos;t count toward
          readiness.
        </p>
      )}
    </section>
  );
}

function Legend() {
  return (
    <section aria-labelledby="legend-title" className="rounded-xl border border-line bg-surface p-4 text-sm shadow-card">
      <h2 id="legend-title" className="text-sm font-semibold">
        How to read a cell
      </h2>
      <div className="mt-3 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">Evidence tier</p>
          <ul className="space-y-2">
            <li className="flex flex-wrap items-center gap-2">
              <TierChip tier="verified" />
              <span className="text-muted">the scanner saw the payment land</span>
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <TierChip tier="community" />
              <span className="text-muted">observed, not provable on-chain</span>
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <TierChip tier="listing" />
              <span className="text-muted">someone else&apos;s claim, untested</span>
            </li>
          </ul>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">Result</p>
          <ul className="space-y-2">
            <li>
              <StatusLabel icon="shield-check" tone="ok" label="Ironwood" /> <span className="text-muted">— landed shielded, current pool</span>
            </li>
            <li>
              <StatusLabel icon="eye" tone="warn" label="Transparent" /> <span className="text-muted">— landed in public view</span>
            </li>
            <li>
              <StatusLabel icon="x-circle" tone="bad" label="Address rejected" /> <span className="text-muted">— the form refused it</span>
            </li>
          </ul>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">Claims and age</p>
          <p className="text-muted">
            <StatusLabel icon="file-text" tone="listed" label="Listed: …" /> always names whose list it comes from.
          </p>
          <p className="flex flex-wrap items-center gap-2 text-muted">
            <StaleChip /> older than {STALE_AFTER_DAYS} days, shown until retested.
          </p>
        </div>
      </div>
    </section>
  );
}

export async function BoardView({ network }: { network: NetworkId }) {
  const { rows, counts, total, untestedWithListing } = await getBoard(network);
  const base = basePath(network);
  const testsOpen = canCreateTests(network);
  const now = new Date();
  const view: BoardRowView[] = rows.map(({ service, cells, readiness }) => {
    const c = {
      ironwood_ua: cellView(cells.ironwood_ua, now),
      full_ua: cellView(cells.full_ua, now),
      transparent: cellView(cells.transparent, now),
    };
    return {
      slug: service.slug,
      name: service.name,
      kind: service.kind,
      href: `${base}/services/${service.slug}`,
      readiness,
      strongestTier: strongestTier(Object.values(c)),
      cells: c,
    };
  });
  const exportHref = `/api/results.json${network === "testnet" ? "?network=testnet" : ""}`;
  const unit = network === "mainnet" ? "ZEC" : "TAZ";

  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent-ink">
          {network === "mainnet" ? "Zcash · Ironwood readiness" : "Testnet · rehearsal board"}
        </p>
        <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">Can I send shielded {unit} to…</h1>
        <p className="mt-3 text-pretty text-muted">
          Each result comes with its proof: a txid and a published viewing key you can check yourself. Claims we haven&apos;t
          tested are labelled as someone else&apos;s.
        </p>
      </div>
      {testsOpen && (
        <Link
          href={`${base}/test`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-btn px-3.5 py-2 text-sm font-medium text-btn-fg shadow-card hover:opacity-90"
        >
          Run a test <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      )}
    </div>
  );

  const between = (
    <>
      {network === "mainnet" && <ReadinessTiles counts={counts} total={total} untestedWithListing={untestedWithListing} />}
      {network === "mainnet" && !testsOpen && (
        <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-muted">
          Mainnet testing hasn&apos;t opened yet.{" "}
          <Link href="/testnet" className="font-medium text-foreground underline underline-offset-2">
            Try the flow on testnet
          </Link>
          .
        </p>
      )}
    </>
  );

  return (
    <div className="space-y-8">
      <BoardExplorer rows={view} heading={heading} between={between} placeholder="Search Binance, Zingo, Trust Wallet…" />
      <Legend />
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <Braces aria-hidden="true" className="size-4 text-subtle" />
        Reuse this data:
        <a href={exportHref} className="hash text-foreground underline underline-offset-2">
          {exportHref}
        </a>
      </p>
    </div>
  );
}
