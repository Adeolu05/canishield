import Link from "next/link";
import { connection } from "next/server";
import { ClipboardCheck } from "lucide-react";
import { FormCheckForm } from "@/components/form-check-form";
import { canLogFormChecks } from "@/lib/form-check";
import { ADDRESS_TYPES, ADDRESS_TYPE_HINT, ADDRESS_TYPE_LABEL } from "@/lib/labels";
import { getReferenceAddresses, listServices } from "@/lib/queries";

export const metadata = { title: "Log a form check" };

export default async function FormCheckPage(props: PageProps<"/report/form-check">) {
  // Request time: whether form checks are on is read from the environment at runtime, not baked in at build.
  await connection();
  if (!canLogFormChecks()) {
    return (
      <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-line bg-surface p-6 shadow-card">
        <h1 className="text-2xl font-semibold tracking-tight">Log a form check</h1>
        <p className="text-muted">
          Form checks are logged from ZecProof&apos;s own machine and aren&apos;t open here.{" "}
          <Link href="/" className="font-medium text-foreground underline underline-offset-2">
            Back to the board
          </Link>
        </p>
      </div>
    );
  }
  const { service } = await props.searchParams;
  const [services, references] = await Promise.all([listServices("mainnet"), getReferenceAddresses()]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="space-y-4">
        <p className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-accent-ink">
          <ClipboardCheck aria-hidden="true" className="size-4" /> Community report · mainnet
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Log a form check</h1>
        <p className="text-pretty text-muted">
          Paste a reference address into the service&apos;s withdrawal form and note whether the form accepts it.{" "}
          <strong className="font-medium text-foreground">Don&apos;t submit the withdrawal.</strong> No key is assigned and no funds move,
          so this is community evidence about the form only: a form that accepts a unified address is not proof that a payment would
          land in Ironwood.
        </p>
      </div>
      <FormCheckForm
        services={services.map((s) => ({ id: s.id, name: s.name }))}
        references={references}
        types={ADDRESS_TYPES.map((t) => ({ value: t, label: ADDRESS_TYPE_LABEL[t], hint: ADDRESS_TYPE_HINT[t] }))}
        preselected={typeof service === "string" ? service : undefined}
        today={today}
      />
    </div>
  );
}
