// NU7, the network upgrade, and the facts the /nu7 page states. Every claim on
// that page links to one of SOURCES; keep the two in step.

/** Mainnet activation height (Zebra 7.0.0 release, ZF). */
export const NU7_HEIGHT = 3_543_405;
/** Testnet activation height (NU7 timeline). */
export const NU7_TESTNET_HEIGHT = 4_465_026;
/** Target block spacing until NU7 activates; 25 s after (ZIP 218). */
export const PRE_NU7_SPACING_S = 75;
export const POST_NU7_SPACING_S = 25;
/** The date the timeline plans activation for. The height is what's fixed. */
export const NU7_PLANNED_DATE = "5 November 2026";

export const SOURCES = {
  timeline: { label: "NU7 Timeline (forum)", href: "https://forum.zcashcommunity.com/t/nu7-timeline/57655" },
  zebra: { label: "Zebra 7.0.0 release (Zcash Foundation)", href: "https://forum.zcashcommunity.com/t/zebra-7-0-0-release/58442" },
  readiness: { label: "NU7 readiness tracker (Cryppit)", href: "https://cryppit.github.io/nu7-readiness/" },
  sprout: {
    label: "Recover an old wallet before the Sprout freeze (forum)",
    href: "https://forum.zcashcommunity.com/t/recover-an-old-zcash-wallet-before-the-sprout-freeze-wallet-dat-zc-addresses-and-sprout-recovery/57718",
  },
  zip218: { label: "ZIP 218", href: "https://zips.z.cash/zip-0218" },
  zip235: { label: "ZIP 235", href: "https://zips.z.cash/zip-0235" },
  zip237: { label: "ZIP 237", href: "https://zips.z.cash/zip-0237" },
  zip259: { label: "ZIP 259", href: "https://zips.z.cash/zip-0259" },
} as const;

export type Nu7State =
  | { phase: "unknown" }
  | { phase: "upcoming"; tip: number; blocksLeft: number; /** Estimated activation, ms since epoch. */ etaMs: number }
  | { phase: "live"; tip: number; blocksSince: number };

/**
 * Where the chain is relative to NU7, from the scanner's last seen tip.
 * The estimate counts from when that tip was seen, at the pre-NU7 75 s spacing.
 */
export function nu7State(tip: number | null | undefined, seenAtMs: number | null | undefined, height = NU7_HEIGHT): Nu7State {
  if (tip == null || !Number.isFinite(tip) || tip <= 0) return { phase: "unknown" };
  if (tip >= height) return { phase: "live", tip, blocksSince: tip - height };
  const blocksLeft = height - tip;
  const from = seenAtMs ?? Date.now();
  return { phase: "upcoming", tip, blocksLeft, etaMs: from + blocksLeft * PRE_NU7_SPACING_S * 1000 };
}

/** "6 d 14 h", "3 h 12 min", "12 min", "under a minute". */
export function formatRemaining(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return "under a minute";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) {
    const m = min - h * 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.floor(h / 24);
  const rh = h - d * 24;
  return rh ? `${d} d ${rh} h` : `${d} d`;
}
