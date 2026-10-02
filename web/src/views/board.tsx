import Link from "next/link";
import { ListedClaimBadge, ListingSource, OutcomeBadge, StaleBadge, TierBadge } from "@/components/badges";
import { READINESS, STALE_AFTER_DAYS, type Cell, type Readiness } from "@/lib/evidence";
import { ADDRESS_TYPES, ADDRESS_TYPE_LABEL } from "@/lib/labels";
import { basePath, canCreateTests, type NetworkId } from "@/lib/network";
import { getBoard } from "@/lib/queries";

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const DATE_VERB: Record<"verified" | "community" | "listing", string> = {
  verified: "Verified",
  community: "Reported",
  listing: "Listing read",
};

function CellView({ cell }: { cell: Cell }) {
  if (cell.tier === "none") return <span className="text-zinc-400">Untested</span>;
  if (cell.tier === "listing") {
    // A claim from someone else's list, never styled like a result.
    return (
      <div className="flex flex-col items-start gap-1">
        <ListedClaimBadge outcome={cell.report.outcome} />
        <ListingSource sourceUrl={cell.report.sourceUrl} />
        <span className="flex items-center gap-1.5 text-xs text-zinc-500">
          {DATE_VERB.listing} {isoDate(cell.date)}
          {cell.stale && <StaleBadge />}
        </span>
      </div>
    );
  }
  const outcome = cell.tier === "verified" ? cell.test.receivedPool : cell.report.outcome;
  return (
    <div className="flex flex-col items-start gap-1">
      {outcome && <OutcomeBadge outcome={outcome} />}
      <TierBadge tier={cell.tier} />
      {cell.tier === "community" && cell.report.status === "unreviewed" && (
        <span className="text-xs text-zinc-500">Pending review</span>
      )}
      <span className="flex items-center gap-1.5 text-xs text-zinc-500">
        {DATE_VERB[cell.tier]} {isoDate(cell.date)}
        {cell.stale && <StaleBadge />}
      </span>
    </div>
  );
}

const PANEL_ORDER: Readiness[] = ["ironwood", "shielded_other", "transparent_only", "rejected", "untested"];
const PANEL_TONE: Record<Readiness, string> = {
  ironwood: "text-emerald-700 dark:text-emerald-300",
  shielded_other: "text-sky-700 dark:text-sky-300",
  transparent_only: "text-rose-700 dark:text-rose-300",
  rejected: "text-zinc-700 dark:text-zinc-200",
  untested: "text-zinc-500 dark:text-zinc-400",
};

function ReadinessPanel({ counts, total, untestedWithListing }: { counts: Record<Readiness, number>; total: number; untestedWithListing: number }) {
  // "Shielded, not Ironwood" only appears once something lands there.
  const shown = PANEL_ORDER.filter((k) => k !== "shielded_other" || counts[k] > 0);
  return (
    <section aria-labelledby="readiness" className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 id="readiness" className="text-sm font-semibold">
        Ironwood readiness · {total} service{total === 1 ? "" : "s"}
      </h2>
      <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {shown.map((k) => (
          <div key={k} title={READINESS[k].meaning}>
            <dt className="text-xs text-zinc-500">{READINESS[k].label}</dt>
            <dd className={`text-2xl font-semibold tabular-nums ${PANEL_TONE[k]}`}>{counts[k]}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-zinc-500">
        Counted from on-chain and community evidence only.
        {untestedWithListing > 0 &&
          ` ${untestedWithListing} of the untested services have an unverified listing, which doesn't count.`}{" "}
        Hover a number for its definition.
      </p>
    </section>
  );
}

export async function BoardView({ network }: { network: NetworkId }) {
  const { rows, counts, total, untestedWithListing } = await getBoard(network);
  const base = basePath(network);
  const testsOpen = canCreateTests(network);
  const exportHref = `/api/results.json${network === "testnet" ? "?network=testnet" : ""}`;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {network === "mainnet" ? "Where do ZEC withdrawals actually land?" : "Testnet board"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Each cell shows the strongest evidence for that address type and when it was established. On-chain verified
            results come from a throwaway key the scanner watched; its viewing key and txid are on the service page so you
            can re-check them. Claims older than {STALE_AFTER_DAYS} days are marked stale until retested.
          </p>
        </div>
        {testsOpen && (
          <Link href={`${base}/test`} className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background">
            Run a test
          </Link>
        )}
      </div>
      {network === "mainnet" && <ReadinessPanel counts={counts} total={total} untestedWithListing={untestedWithListing} />}
      {network === "mainnet" && !testsOpen && (
        <p className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          Mainnet testing hasn&apos;t opened yet. Until it does, see the{" "}
          <Link href="/testnet" className="underline">
            testnet board
          </Link>{" "}
          for how the test flow works.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
            <tr>
              <th className="px-4 py-3 font-medium">Service</th>
              {ADDRESS_TYPES.map((t) => (
                <th key={t} className="px-4 py-3 font-medium">
                  {ADDRESS_TYPE_LABEL[t]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {rows.map(({ service, cells }) => (
              <tr key={service.id}>
                <td className="px-4 py-3">
                  <Link href={`${base}/services/${service.slug}`} className="font-medium hover:underline">
                    {service.name}
                  </Link>
                  <div className="text-xs capitalize text-zinc-500">{service.kind}</div>
                </td>
                {ADDRESS_TYPES.map((t) => (
                  <td key={t} className="px-4 py-3 align-top">
                    <CellView cell={cells[t]} />
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  No services on this board yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <footer className="space-y-1 border-t border-zinc-200 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
        <p>
          Reuse this data:{" "}
          <a href={exportHref} className="underline">
            {exportHref}
          </a>{" "}
          (JSON).
        </p>
        <p>
          ZecProof results (verified tests and community reports) are licensed{" "}
          <a href="https://creativecommons.org/licenses/by/4.0/" className="underline" rel="license noreferrer" target="_blank">
            CC BY 4.0
          </a>
          .
        </p>
        <p>
          Unverified listings are adapted from the ZecHub Wiki (ZecHub contributors) and stay under{" "}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/" className="underline" rel="license noreferrer" target="_blank">
            CC BY-SA 4.0
          </a>
          . ZecProof&apos;s code is MIT.
        </p>
      </footer>
    </div>
  );
}
