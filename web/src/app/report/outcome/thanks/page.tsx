import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export const metadata = { title: "Thanks for your report", robots: { index: false } };

export default async function OutcomeThanksPage(props: PageProps<"/report/outcome/thanks">) {
  const { service } = await props.searchParams;
  // Only a plain slug goes into the link back.
  const slug = typeof service === "string" && /^[a-z0-9-]{1,64}$/.test(service) ? service : null;
  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-xl border border-line bg-surface p-6 shadow-card">
      <span className="grid size-10 place-items-center rounded-lg bg-surface-2 text-accent-ink">
        <CheckCircle2 aria-hidden="true" className="size-5" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">Thanks, your report is in.</h1>
      <p className="text-muted">
        It will be reviewed before it counts. Nothing that could point to your transaction was kept, and any screenshot link is deleted after
        review.
      </p>
      <div className="flex flex-wrap gap-3 pt-2">
        {slug && (
          <Link href={`/services/${slug}`} className="rounded-lg border border-line-strong px-4 py-2 text-sm transition-colors duration-150 hover:bg-surface-2">
            Back to the service
          </Link>
        )}
        <Link href="/" className="rounded-lg border border-line-strong px-4 py-2 text-sm transition-colors duration-150 hover:bg-surface-2">
          Back to the board
        </Link>
      </div>
    </div>
  );
}
