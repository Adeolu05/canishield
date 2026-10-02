// Status primitives. Colour is never the only signal: every status renders an
// icon and a word, and icons are aria-hidden so screen readers get the word.
import {
  BadgeCheck,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  Eye,
  FileText,
  Shield,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { IconKey, Tone } from "@/lib/present";

export const ICONS: Record<IconKey, LucideIcon> = {
  "shield-check": ShieldCheck,
  shield: Shield,
  eye: Eye,
  "x-circle": CircleX,
  "check-circle": CircleCheck,
  "file-text": FileText,
  "circle-dashed": CircleDashed,
  "badge-check": BadgeCheck,
  users: Users,
  clock: Clock,
};

export const TONE_TEXT: Record<Tone, string> = {
  ok: "text-ok",
  shield: "text-shield",
  warn: "text-warn",
  bad: "text-bad",
  info: "text-info",
  listed: "text-listed",
  neutral: "text-subtle",
};

export const TONE_SOFT: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  shield: "bg-shield-soft text-shield",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  listed: "bg-listed-soft text-listed",
  neutral: "bg-surface-2 text-subtle",
};

export function StatusIcon({ icon, className = "size-4" }: { icon: IconKey; className?: string }) {
  const Icon = ICONS[icon];
  return <Icon aria-hidden="true" className={`shrink-0 ${className}`} strokeWidth={2} />;
}

/** Icon + word in the tone's colour. The main way a result is shown. */
export function StatusLabel({ icon, tone, label, className = "" }: { icon: IconKey; tone: Tone; label: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium ${TONE_TEXT[tone]} ${className}`}>
      <StatusIcon icon={icon} />
      {label}
    </span>
  );
}

const chip = "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap";

/**
 * Evidence tier. Distinct by shape as well as colour:
 * verified = solid, community = outlined, listing = dashed grey.
 */
export function TierChip({ tier }: { tier: "verified" | "community" | "listing" }) {
  if (tier === "verified") {
    return (
      <span className={`${chip} bg-ok-solid text-ok-solid-fg`}>
        <BadgeCheck aria-hidden="true" className="size-3" strokeWidth={2.5} />
        On-chain verified
      </span>
    );
  }
  if (tier === "community") {
    return (
      <span className={`${chip} border border-info/40 text-info`}>
        <Users aria-hidden="true" className="size-3" strokeWidth={2.5} />
        Community reported
      </span>
    );
  }
  return (
    <span className={`${chip} border border-dashed border-line-strong text-listed`}>
      <FileText aria-hidden="true" className="size-3" strokeWidth={2.5} />
      Unverified listing
    </span>
  );
}

export function StaleChip() {
  return (
    <span title="Older than 30 days; shown as stale until retested" className={`${chip} bg-stale-soft text-stale`}>
      <Clock aria-hidden="true" className="size-3" strokeWidth={2.5} />
      Stale
    </span>
  );
}

export function PendingChip() {
  return <span className={`${chip} bg-surface-2 text-subtle`}>Pending review</span>;
}
