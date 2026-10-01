// Every /testnet page carries this banner. It cannot be dismissed.
export default function TestnetLayout({ children }: LayoutProps<"/testnet">) {
  return (
    <>
      <div
        role="note"
        className="mb-6 rounded-lg border border-amber-400 bg-amber-100 px-4 py-3 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100"
      >
        <strong className="font-semibold">Testnet.</strong> Results here use test coins (TAZ). They show how a service
        behaves on testnet, not whether it supports shielded ZEC on mainnet.
      </div>
      {children}
    </>
  );
}
