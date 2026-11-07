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
 * The estimate counts from `anchorMs` (the tip block's header time, or when the
 * tip was seen) at `spacingS` per block: the measured pace, or the 75 s target.
 */
export function nu7State(
  tip: number | null | undefined,
  anchorMs: number | null | undefined,
  height = NU7_HEIGHT,
  spacingS = PRE_NU7_SPACING_S,
): Nu7State {
  if (tip == null || !Number.isFinite(tip) || tip <= 0) return { phase: "unknown" };
  if (tip >= height) return { phase: "live", tip, blocksSince: tip - height };
  const blocksLeft = height - tip;
  const from = anchorMs ?? Date.now();
  return { phase: "upcoming", tip, blocksLeft, etaMs: from + blocksLeft * spacingS * 1000 };
}

/**
 * The version key in share-card and share-link URLs (`?b=`). Each new key makes the
 * card route draw a fresh PNG, the heaviest work on the site, so it moves in steps
 * instead of on every block: every 10 blocks while more than 100 are left, then on
 * every block for the final approach, and every 100 blocks (about 40 minutes at
 * the 25 s spacing) once NU7 is live, when the stopwatch averages barely move from
 * one block to the next. A card drawn inside a step still shows the numbers at that
 * moment.
 */
export function cardKey(state: Nu7State): string {
  if (state.phase === "upcoming") {
    const left = state.blocksLeft > 100 ? Math.ceil(state.blocksLeft / 10) * 10 : state.blocksLeft;
    return String(left);
  }
  if (state.phase === "live") return `live${Math.floor(state.blocksSince / 100) * 100}`;
  return state.phase;
}

/** One recorded block: height and header time (ms since epoch). */
export interface BlockPoint {
  h: number;
  t: number;
}

/** The newest run of consecutive heights, oldest first. Input in any order; duplicates ignored. */
export function contiguousTail(blocks: BlockPoint[]): BlockPoint[] {
  const sorted = [...new Map(blocks.map((b) => [b.h, b])).values()].sort((a, b) => a.h - b.h);
  let i = sorted.length - 1;
  while (i > 0 && sorted[i - 1].h === sorted[i].h - 1) i--;
  return sorted.slice(Math.max(i, 0));
}

export interface Pace {
  /** Average seconds per block. */
  seconds: number;
  /** How many block intervals it was measured over. */
  intervals: number;
}

/**
 * Average block spacing over the newest consecutive run of blocks within
 * [minHeight, maxHeight], at most `n` intervals; null if fewer than `minIntervals`.
 * End-to-end time over block count, so one odd header time can't skew it much.
 */
export function averageSpacing(
  blocks: BlockPoint[],
  { minHeight = -Infinity, maxHeight = Infinity, n = 100, minIntervals = 10 }: { minHeight?: number; maxHeight?: number; n?: number; minIntervals?: number } = {},
): Pace | null {
  const run = contiguousTail(blocks.filter((b) => b.h >= minHeight && b.h <= maxHeight)).slice(-(n + 1));
  const intervals = run.length - 1;
  if (intervals < minIntervals) return null;
  const seconds = (run[run.length - 1].t - run[0].t) / 1000 / intervals;
  return seconds > 0 ? { seconds, intervals } : null;
}

/**
 * A fixed, checkable reference block for the long-run pace: height 3,520,000,
 * header time 1792168825 (16 Oct 2026, 16:40:25 UTC). Averaging over the
 * thousands of blocks since keeps the estimate steady; 100 blocks alone swing
 * it by several seconds per block, which is more than half a day at this range.
 */
export const PACE_ANCHOR: BlockPoint = { h: 3_520_000, t: 1_792_168_825_000 };

/** Average spacing between two recorded blocks (end-to-end time over the height difference), or null under `minIntervals`. */
export function paceBetween(from: BlockPoint | undefined, to: BlockPoint | undefined, minIntervals = 1): Pace | null {
  if (!from || !to) return null;
  const intervals = to.h - from.h;
  if (intervals < Math.max(1, minIntervals)) return null;
  const seconds = (to.t - from.t) / 1000 / intervals;
  return seconds > 0 ? { seconds, intervals } : null;
}

/** Average spacing from `anchor` to `block`, or null when the block isn't at least 1,000 blocks later. */
export function paceSince(anchor: BlockPoint, block: BlockPoint | undefined): Pace | null {
  return paceBetween(anchor, block, 1000);
}

/** How many times as often blocks come after NU7 than before, to one decimal; null without both paces. */
export function speedup(before: Pace | null | undefined, after: Pace | null | undefined): number | null {
  if (!before || !after || after.seconds <= 0) return null;
  return Math.round((before.seconds / after.seconds) * 10) / 10;
}

/** The spacing to estimate with: the measured pre-NU7 pace kept within 60 to 90 s, else the 75 s target. */
export const estimateSpacing = (pace: Pace | null) => (pace ? Math.min(90, Math.max(60, pace.seconds)) : PRE_NU7_SPACING_S);

/** Days, hours, minutes, seconds left (never negative). */
export function clockParts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86_400), h: Math.floor((s % 86_400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
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
