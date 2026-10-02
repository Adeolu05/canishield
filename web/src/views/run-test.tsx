import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { createTest } from "@/app/actions";
import { Stepper } from "@/components/stepper";
import { ADDRESS_TYPES, ADDRESS_TYPE_HINT, ADDRESS_TYPE_LABEL } from "@/lib/labels";
import { NETWORKS, canCreateTests, type NetworkId } from "@/lib/network";
import { listServices } from "@/lib/queries";

export async function RunTestView({ network, preselected }: { network: NetworkId; preselected?: string }) {
  if (!canCreateTests(network)) {
    return (
      <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-line bg-surface p-6 shadow-card">
        <h1 className="text-2xl font-semibold tracking-tight">Run a test</h1>
        <p className="text-muted">
          Mainnet tests aren&apos;t open yet. You can try the whole flow with free test coins on the{" "}
          <Link href="/testnet/test" className="font-medium text-foreground underline underline-offset-2">
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
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-6">
        <Stepper current={0} />
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Run a test</h1>
          <p className="mt-2 text-pretty text-muted">
            Pick a service and an address type. You&apos;ll get a fresh, throwaway address; send the smallest amount of {unit} the
            service allows, and the scanner records which pool it lands in, with the txid and block.
          </p>
        </div>
      </div>

      <form action={createTest} className="space-y-6 rounded-xl border border-line bg-surface p-6 shadow-card">
        <input type="hidden" name="network" value={network} />
        <div className="space-y-2">
          <label htmlFor="serviceId" className="text-sm font-medium">
            Service
          </label>
          <select
            id="serviceId"
            name="serviceId"
            required
            defaultValue={preselected ?? ""}
            className="h-11 w-full rounded-lg border border-line-strong bg-surface px-4 text-sm"
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
          {services.length === 0 && <p className="text-xs text-subtle">No services on this board yet.</p>}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Address type</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {ADDRESS_TYPES.map((t, i) => (
              <label
                key={t}
                className="flex cursor-pointer flex-col gap-1 rounded-lg border border-line p-4 has-[:checked]:border-accent-ink has-[:checked]:bg-surface-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-ink"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <input type="radio" name="addressType" value={t} defaultChecked={i === 0} className="accent-[var(--accent-ink)]" />
                  {ADDRESS_TYPE_LABEL[t]}
                </span>
                <span className="text-xs text-subtle">{ADDRESS_TYPE_HINT[t]}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-subtle">Sapling-only addresses are coming later.</p>
        </fieldset>

        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-lg bg-btn px-4 py-2 text-sm font-medium text-btn-fg shadow-card transition-opacity duration-150 hover:opacity-90"
        >
          Generate test address <ArrowRight aria-hidden="true" className="size-4" />
        </button>
      </form>
    </div>
  );
}
