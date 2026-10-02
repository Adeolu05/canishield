import { FlaskConical } from "lucide-react";

// Every /testnet page carries this banner. It cannot be dismissed.
export default function TestnetLayout({ children }: LayoutProps<"/testnet">) {
  return (
    <>
      <div role="note" className="mb-8 flex items-start gap-3 rounded-xl border border-stale/30 bg-stale-soft px-4 py-3 text-sm text-stale">
        <FlaskConical aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong className="font-semibold">Testnet.</strong> Results here use test coins (TAZ). They show how a service behaves on
          testnet, not whether it supports shielded ZEC on mainnet.
        </p>
      </div>
      {children}
    </>
  );
}
