// CanIShield mark: a gold shield with a check, for "yes, shielded ZEC works here".
import { MARK_CHECK, MARK_SHIELD } from "@/lib/brand";

export function LogoMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <path d={MARK_SHIELD} fill="#F4B728" />
      <path d={MARK_CHECK} fill="none" stroke="#18181B" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark />
      {/* Very narrow phones (< 360px) show the mark only, so the header never scrolls sideways. */}
      <span className="text-[15px] font-semibold tracking-tight max-[359px]:sr-only">
        CanI<span className="text-accent-ink">Shield</span>
      </span>
    </span>
  );
}
