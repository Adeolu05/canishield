import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-xl bg-surface-2 text-subtle">
        <SearchX aria-hidden="true" className="size-6" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">Not on this board</h1>
      <p className="text-muted">
        That service or test doesn&apos;t exist here. Mainnet and testnet are separate: a testnet test lives under{" "}
        <span className="hash">/testnet</span>.
      </p>
      <Link href="/" className="inline-flex items-center gap-1 rounded-lg border border-line-strong px-4 py-2 text-sm transition-colors duration-150 hover:bg-surface-2">
        <ArrowLeft aria-hidden="true" className="size-4" /> Back to the board
      </Link>
    </div>
  );
}
