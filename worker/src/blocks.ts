// Block headers for the NU7 page's live chain strip (height and header time only).
import { and, eq, lt, max } from "drizzle-orm";
import { chainBlocks, type Db } from "@zecproof/db";
import { ENDPOINT_TIMEOUT_MS, type WorkerConfig } from "./config";
import type { HealthyEndpoint } from "./endpoints";
import { getBlockTime } from "./lightwalletd";

/** How far back the chain strip starts when there is no history, and the most headers fetched per cycle. */
const BLOCK_HISTORY = 120;
const BLOCKS_PER_CYCLE = 30;
const BLOCK_RETENTION_DAYS = 30;

/**
 * Records height and header time of new blocks for the NU7 page's chain strip.
 * Picks up after the last stored block (or BLOCK_HISTORY back from the tip after
 * a long gap), at most BLOCKS_PER_CYCLE per cycle. Never allowed to stop a cycle.
 */
export async function recordBlocks(db: Db, cfg: Pick<WorkerConfig, "network">, endpoint: Pick<HealthyEndpoint, "client" | "tip">) {
  try {
    const [{ last }] = await db.select({ last: max(chainBlocks.height) }).from(chainBlocks).where(eq(chainBlocks.network, cfg.network));
    const from = Math.max(last == null ? 0 : last + 1, endpoint.tip - BLOCK_HISTORY + 1);
    const to = Math.min(endpoint.tip, from + BLOCKS_PER_CYCLE - 1);
    for (let height = from; height <= to; height++) {
      const time = await getBlockTime(endpoint.client, height, ENDPOINT_TIMEOUT_MS);
      if (!time) break; // header time unset: try again next cycle rather than leave a gap
      await db.insert(chainBlocks).values({ network: cfg.network, height, time }).onConflictDoNothing();
    }
    await db
      .delete(chainBlocks)
      .where(and(eq(chainBlocks.network, cfg.network), lt(chainBlocks.time, new Date(Date.now() - BLOCK_RETENTION_DAYS * 86_400_000))));
  } catch (err) {
    console.warn(`blocks    ${err instanceof Error ? err.message : err}`);
  }
}
