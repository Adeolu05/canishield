import Link from "next/link";
import { connection } from "next/server";
import { MessageSquareWarning } from "lucide-react";
import { OutcomeForm } from "@/components/outcome-form";
import { outcomeReportsEnabled } from "@/lib/network";
import { AMOUNT_BANDS, AMOUNT_BAND_LABEL, OUTCOME_RESULTS, OUTCOME_RESULT_LABEL, OUTCOME_ROUTES, OUTCOME_ROUTE_LABEL } from "@/lib/outcome";
import { OUTCOME_SERVICE_KINDS } from "@/lib/outcome-store";
import { listServices } from "@/lib/queries";

export const metadata = {
  title: "Report what happened",
  description: "Sent shielded ZEC to an exchange or swap? Say whether it was credited, held or refused, so the next person knows before they send.",
};

export default async function OutcomePage(props: PageProps<"/report/outcome">) {
  // Request time: the kill switch is read from the environment at runtime, not baked in at build.
  await connection();
  if (!outcomeReportsEnabled()) {
    return (
      <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-line bg-surface p-6 shadow-card">
        <h1 className="text-2xl font-semibold tracking-tight">Report what happened</h1>
        <p className="text-muted">
          Outcome reports are paused right now.{" "}
          <Link href="/" className="font-medium text-foreground underline underline-offset-2">
            Back to the board
          </Link>
        </p>
      </div>
    );
  }
  const { service } = await props.searchParams;
  const kinds: readonly string[] = OUTCOME_SERVICE_KINDS;
  const services = (await listServices("mainnet")).filter((s) => kinds.includes(s.kind));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-4">
        <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-accent-ink">
          <MessageSquareWarning aria-hidden="true" className="size-4" /> Exit outcomes · mainnet
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Sent shielded ZEC somewhere? Say what happened.</h1>
        <p className="text-pretty text-muted">
          Exchanges and swaps change how they treat ZEC from the shielded pool, and nobody records when. Your report tells the next person
          what to expect before they send.{" "}
          <strong className="font-medium text-foreground">
            Only an amount range, the week and the route are kept: nothing that could point to your transaction.
          </strong>{" "}
          Every report is reviewed before it counts.
        </p>
      </div>
      <OutcomeForm
        services={services.map((s) => ({ id: s.id, name: s.name }))}
        results={OUTCOME_RESULTS.map((r) => ({ value: r, ...OUTCOME_RESULT_LABEL[r] }))}
        bands={AMOUNT_BANDS.map((b) => ({ value: b, label: AMOUNT_BAND_LABEL[b] }))}
        routes={OUTCOME_ROUTES.map((r) => ({ value: r, ...OUTCOME_ROUTE_LABEL[r] }))}
        preselected={typeof service === "string" && services.some((s) => s.id === service) ? service : undefined}
        today={today}
      />
    </div>
  );
}
