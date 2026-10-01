import Link from "next/link";
import { createTest } from "@/app/actions";
import { ADDRESS_TYPES, ADDRESS_TYPE_HINT, ADDRESS_TYPE_LABEL } from "@/lib/labels";
import { NETWORKS, canCreateTests, type NetworkId } from "@/lib/network";
import { listServices } from "@/lib/queries";

export async function RunTestView({ network, preselected }: { network: NetworkId; preselected?: string }) {
  if (!canCreateTests(network)) {
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="text-2xl font-semibold">Run a test</h1>
        <p className="text-sm">
          Mainnet tests aren&apos;t open yet. You can try the whole flow with test coins on the{" "}
          <Link href="/testnet/test" className="underline">
            testnet
          </Link>
          .
        </p>
      </div>
    );
  }
  const services = await listServices(network);
  const unit = NETWORKS[network].unit;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Run a test</h1>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>Pick the service and the address type to test.</li>
          <li>We generate a fresh, throwaway address for this test only.</li>
          <li>Withdraw the smallest amount of {unit} the service allows to that address.</li>
          <li>The scanner records which pool it landed in, with the txid and block.</li>
        </ol>
      </div>

      <form action={createTest} className="space-y-5">
        <input type="hidden" name="network" value={network} />
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Service</span>
          <select
            name="serviceId"
            required
            defaultValue={preselected ?? ""}
            className="w-full rounded-md border border-zinc-300 bg-background px-3 py-2 text-sm dark:border-zinc-700"
          >
            <option value="" disabled>
              Choose a service…
            </option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Address type</legend>
          {ADDRESS_TYPES.map((t, i) => (
            <label
              key={t}
              className="flex cursor-pointer gap-3 rounded-md border border-zinc-200 p-3 has-[:checked]:border-foreground dark:border-zinc-800"
            >
              <input type="radio" name="addressType" value={t} defaultChecked={i === 0} className="mt-1" />
              <span>
                <span className="block text-sm font-medium">{ADDRESS_TYPE_LABEL[t]}</span>
                <span className="block text-xs text-zinc-500">{ADDRESS_TYPE_HINT[t]}</span>
              </span>
            </label>
          ))}
          <p className="text-xs text-zinc-500">Sapling-only addresses are coming later.</p>
        </fieldset>

        <button type="submit" className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background">
          Generate test address
        </button>
      </form>
    </div>
  );
}
