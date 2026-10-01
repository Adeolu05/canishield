import { createTest } from "@/app/actions";
import { ADDRESS_TYPES, ADDRESS_TYPE_HINT, ADDRESS_TYPE_LABEL } from "@/lib/labels";
import { listServices } from "@/lib/queries";

export default async function RunTestPage(props: PageProps<"/test">) {
  const [{ service: preselected }, services] = await Promise.all([props.searchParams, listServices()]);

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Run a test</h1>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>Pick the service and the address type to test.</li>
          <li>We generate a fresh, throwaway testnet address for this test only.</li>
          <li>Withdraw a small amount of TAZ from the service to that address.</li>
          <li>The scanner records which pool it landed in, with the txid and block.</li>
        </ol>
      </div>

      <form action={createTest} className="space-y-5">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Service</span>
          <select
            name="serviceId"
            required
            defaultValue={typeof preselected === "string" ? preselected : ""}
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
