// Everything the NU7 page, its API, share cards and calendar file read: the
// scanner's tip plus the block headers it recorded. One query path, so the
// numbers on the page, in a share card and in the calendar always agree.
import "server-only";
import { connection } from "next/server";
import { and, between, desc, eq } from "drizzle-orm";
import { chainBlocks } from "@zecproof/db";
import { getDb } from "./db";
import { getScannerHeartbeat } from "./queries";
import { NU7_HEIGHT, averageSpacing, contiguousTail, estimateSpacing, nu7State, type BlockPoint, type Pace } from "./nu7";

/** The worker polls every 30 s; two missed cycles means offline (same rule as the scanner pill). */
const ONLINE_WITHIN_MS = 90_000;
/** Blocks sent to the page: enough for 40 minutes after NU7 (about 96 blocks). */
const RECENT = 120;

export interface Nu7Snapshot {
  tip: number | null;
  seenAt: string | null;
  online: boolean;
  /** Newest consecutive run of recorded blocks, oldest first. */
  blocks: BlockPoint[];
  /** Measured pre-NU7 pace (last 100 blocks below the height). */
  pace: Pace | null;
  /** Seconds per block used for the estimate. */
  spacingS: number;
  /** Estimated activation (ms), while upcoming. */
  etaMs: number | null;
  /** Header time of block 3,543,405 and the pace after it, once recorded. */
  activation: { time: number; previousTime: number | null; after: Pace | null; firstBlocks: BlockPoint[] } | null;
}

export const EMPTY_SNAPSHOT: Nu7Snapshot = { tip: null, seenAt: null, online: false, blocks: [], pace: null, spacingS: 75, etaMs: null, activation: null };

const toPoint = (r: { height: number; time: Date }): BlockPoint => ({ h: r.height, t: r.time.getTime() });

/** Never throws: a database problem gives an empty snapshot, and the page falls back to the planned date. */
export async function getNu7Snapshot(): Promise<Nu7Snapshot> {
  await connection();
  try {
    const db = getDb();
    const [hb, recentRows, activationRows] = await Promise.all([
      getScannerHeartbeat("mainnet"),
      db
        .select({ height: chainBlocks.height, time: chainBlocks.time })
        .from(chainBlocks)
        .where(eq(chainBlocks.network, "mainnet"))
        .orderBy(desc(chainBlocks.height))
        .limit(RECENT),
      db
        .select({ height: chainBlocks.height, time: chainBlocks.time })
        .from(chainBlocks)
        .where(and(eq(chainBlocks.network, "mainnet"), between(chainBlocks.height, NU7_HEIGHT - 1, NU7_HEIGHT + 40)))
        .orderBy(chainBlocks.height),
    ]);
    const blocks = contiguousTail(recentRows.map(toPoint));
    const tip = Math.max(hb?.tip ?? 0, blocks.at(-1)?.h ?? 0) || null;
    const pace = averageSpacing(blocks, { maxHeight: NU7_HEIGHT - 1 });
    const spacingS = estimateSpacing(pace);
    // Anchor the estimate on the tip block's own header time when we have it.
    const tipBlock = blocks.find((b) => b.h === tip);
    const anchor = tipBlock?.t ?? hb?.seenAt.getTime() ?? null;
    const state = nu7State(tip, anchor, NU7_HEIGHT, spacingS);

    const around = activationRows.map(toPoint);
    const act = around.find((b) => b.h === NU7_HEIGHT);
    const after = around.filter((b) => b.h >= NU7_HEIGHT);
    const activation = act
      ? {
          time: act.t,
          previousTime: around.find((b) => b.h === NU7_HEIGHT - 1)?.t ?? null,
          after: averageSpacing(after, { minHeight: NU7_HEIGHT, minIntervals: 5 }),
          firstBlocks: after.slice(0, 12),
        }
      : null;

    return {
      tip,
      seenAt: hb?.seenAt.toISOString() ?? null,
      online: !!hb && Date.now() - hb.seenAt.getTime() <= ONLINE_WITHIN_MS,
      blocks,
      pace,
      spacingS,
      etaMs: state.phase === "upcoming" ? state.etaMs : null,
      activation,
    };
  } catch (err) {
    console.error("nu7 snapshot", err);
    return EMPTY_SNAPSHOT;
  }
}

