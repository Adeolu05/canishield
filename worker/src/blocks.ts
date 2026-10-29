// Block headers for the NU7 page's live chain strip (height and header time only).
import { and, between, eq, lt, max, not } from "drizzle-orm";
import { chainBlocks, type Db } from "@zecproof/db";
import { ENDPOINT_TIMEOUT_MS, type WorkerConfig } from "./config";
import type { HealthyEndpoint } from "./endpoints";
import { getBlockTime } from "./lightwalletd";

/** How far back the strip starts with no history (or after a long gap), and the most headers fetched per cycle. */
const BLOCK_HISTORY = 120;
const BLOCKS_PER_CYCLE = 30;
/** Stop fetching after this long in one cycle, so a slow endpoint never holds up the test work. */
const TIME_BUDGET_MS = 4_000;
/** Rows kept per network, newest first (about 40 h at 75 s, 14 h at 25 s); the activation window is kept for good. */
const KEEP_BLOCKS = 2_000;

/** Mainnet NU7 activation. The page's "on the record" section reads these heights, so they are fetched and kept. */
const NU7_MAINNET_HEIGHT = 3_543_405;
export const ACTIVATION_WINDOW = { from: NU7_MAINNET_HEIGHT - 1, to: NU7_MAINNET_HEIGHT + 40 } as const;

/**
 * Records height and header time of new blocks. Picks up after the last stored
 * block (or BLOCK_HISTORY back from the tip after a long gap), at most
 * BLOCKS_PER_CYCLE per cycle and TIME_BUDGET_MS of fetching. On mainnet, also
 * fills any missing block in the NU7 activation window once the tip has passed
 * it. Never allowed to stop a cycle.
 */
export async function recordBlocks(db: Db, cfg: Pick<WorkerConfig, "network">, endpoint: Pick<HealthyEndpoint, "client" | "tip">) {
  const deadline = Date.now() + TIME_BUDGET_MS;
  try {
    const fetchOne = async (height: number) => {
      const time = await getBlockTime(endpoint.client, height, Math.min(ENDPOINT_TIMEOUT_MS, Math.max(1_000, deadline - Date.now())));
      if (!time) return false; // header time unset: try again next cycle rather than store a guess
      await db.insert(chainBlocks).values({ network: cfg.network, height, time }).onConflictDoNothing();
      return true;
    };

    const [{ last }] = await db.select({ last: max(chainBlocks.height) }).from(chainBlocks).where(eq(chainBlocks.network, cfg.network));
    const from = Math.max(last == null ? 0 : last + 1, endpoint.tip - BLOCK_HISTORY + 1);
    const to = Math.min(endpoint.tip, from + BLOCKS_PER_CYCLE - 1);
    for (let height = from; height <= to && Date.now() < deadline; height++) {
      if (!(await fetchOne(height))) break;
    }

    if (cfg.network === "mainnet" && endpoint.tip >= ACTIVATION_WINDOW.to && Date.now() < deadline) {
      const have = await db
        .select({ height: chainBlocks.height })
        .from(chainBlocks)
        .where(and(eq(chainBlocks.network, "mainnet"), between(chainBlocks.height, ACTIVATION_WINDOW.from, ACTIVATION_WINDOW.to)));
      const got = new Set(have.map((r) => r.height));
      for (let height = ACTIVATION_WINDOW.from; height <= ACTIVATION_WINDOW.to && Date.now() < deadline; height++) {
        if (!got.has(height)) await fetchOne(height);
      }
    }

    // Prune by height (the primary key), never the activation window.
    const newest = Math.max(last ?? 0, to);
    await db
      .delete(chainBlocks)
      .where(
        and(
          eq(chainBlocks.network, cfg.network),
          lt(chainBlocks.height, newest - KEEP_BLOCKS),
          cfg.network === "mainnet" ? not(between(chainBlocks.height, ACTIVATION_WINDOW.from, ACTIVATION_WINDOW.to)) : undefined,
        ),
      );
  } catch (err) {
    console.warn(`blocks    ${err instanceof Error ? err.message : err}`);
  }
}
