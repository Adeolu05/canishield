import Link from "next/link";
import { OutcomeBadge, TierBadge } from "@/components/badges";
import { ADDRESS_TYPES, ADDRESS_TYPE_LABEL } from "@/lib/labels";
import { getBoard, type Cell } from "@/lib/queries";

function CellView({ cell }: { cell: Cell }) {
  if (cell.tier === "none") return <span className="text-zinc-400">Untested</span>;
  const outcome = cell.tier === "verified" ? cell.test.receivedPool : cell.report.outcome;
  return (
    <div className="flex flex-col items-start gap-1">
      {outcome && <OutcomeBadge outcome={outcome} />}
      <TierBadge tier={cell.tier} />
      {cell.tier === "community" && cell.report.status === "unreviewed" && (
        <span className="text-xs text-zinc-500">Pending review</span>
      )}
    </div>
  );
}

export default async function BoardPage() {
  const rows = await getBoard();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Where do withdrawals actually land?</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          Each cell shows the strongest evidence for that address type. On-chain verified results come from a
          throwaway key the scanner watched; its viewing key and txid are on the service page so you can re-check
          them. Community reports (e.g. a form that refused the address) and unverified listings are labelled as such.
        </p>
      </div>
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
                  <Link href={`/services/${service.slug}`} className="font-medium hover:underline">
                    {service.name}
                  </Link>
                  <div className="text-xs capitalize text-zinc-500">{service.kind}</div>
                </td>
                {ADDRESS_TYPES.map((t) => (
                  <td key={t} className="px-4 py-3">
                    <CellView cell={cells[t]} />
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  No services yet. Run <code>npm run db:seed</code>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
