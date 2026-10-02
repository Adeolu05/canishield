// ZecProof mark: a gold shield with a check — proof that a payment landed.
export function LogoMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <path d="M16 2.5 4.5 6.8v8.4c0 7.2 4.8 12.6 11.5 14.3 6.7-1.7 11.5-7.1 11.5-14.3V6.8L16 2.5Z" fill="#F4B728" />
      <path
        d="M10.5 11.5h11l-9.3 9h9.3"
        fill="none"
        stroke="#18181B"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight">
        Zec<span className="text-accent-ink">Proof</span>
      </span>
    </span>
  );
}
