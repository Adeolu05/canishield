// One-off: seeds the exit outcome record with three cases already public on the
// Zcash forum, each linked to the post it comes from and dated by it. Checked
// against the threads on 13 Nov 2026. Adds NEAR Intents as a mainnet service
// (kind "swap") if it isn't there yet. Running it with --apply is the
// maintainer's review, so the rows go in as accepted.
// Dry run by default; --apply writes. Safe to run twice: a case whose source
// link is already stored is skipped.
//
//   cd web && npx tsx scripts/seed-outcomes-nov13.mts [--apply]
import { eq } from "drizzle-orm";
import { createDb, outcomeReports, services, type AmountBand, type OutcomeResult, type OutcomeRoute } from "@zecproof/db";
import { identifyingContent, mondayOf } from "../src/lib/outcome";

const REVIEWER = "David Peluola (maintainer)";
const NEAR = {
  slug: "near-intents",
  name: "NEAR Intents",
  kind: "swap" as const,
  websiteUrl: "https://docs.near-intents.org",
  notes: "Cross-chain swaps. Added for the exit outcome record; not yet tested by CanIShield.",
  networks: ["mainnet"],
};

type Case = {
  slug: string;
  result: OutcomeResult;
  amountBand: AmountBand;
  route: OutcomeRoute;
  sentDay: string; // the day the forum post dates it to; only its week is stored
  daysHeld: number | null;
  sourceUrl: string;
  note: string;
};

const BINANCE_THREAD = "https://forum.zcashcommunity.com/t/binance-rejecting-deposits-from-zcash-shielded-addresses/47667";
const NEAR_THREAD =
  "https://forum.zcashcommunity.com/t/my-experience-exiting-shielded-zec-from-zodl-to-near-intents-589k-usdt-still-held-50-days-despite-a-written-compliance-clearance/57497";

const CASES: Case[] = [
  {
    // Posts 1 and 13 to 20, 15 and 16 May 2024.
    slug: "binance",
    result: "rejected",
    amountBand: "unknown",
    route: "direct_shielded",
    sentDay: "2024-05-15",
    daysHeld: null,
    sourceUrl: `${BINANCE_THREAD}/1`,
    note: "A deposit from a shielded Zashi address was refused. Support said to wait about 32 days. Others in the thread reported the same that week. A day later the poster said the return was being processed.",
  },
  {
    // Posts 74 and 78, 19 and 21 Sep 2026. The deposit's own date isn't given; the week is the post's.
    slug: "binance",
    result: "rejected",
    amountBand: "unknown",
    route: "direct_shielded",
    sentDay: "2026-09-19",
    daysHeld: null,
    sourceUrl: `${BINANCE_THREAD}/74`,
    note: "A shielded deposit was refused (forum post of 19 Sep 2026). On 21 Sep, Binance told a community contact it would return the funds after an audit, with no timeframe.",
  },
  {
    // Posts 1, 23, 55 and 60. Held deposit 20 Jul 2026; 67 days at the last update, 25 Sep.
    slug: "near-intents",
    result: "held_open",
    amountBand: "over_100",
    route: "swap",
    sentDay: "2026-07-20",
    daysHeld: 67,
    sourceUrl: `${NEAR_THREAD}/55`,
    note: "The swap of shielded ZEC to USDT went through. The USDT sent back about 8 hours later was held. Cleared in writing on 23 Jul, back under review on 27 Aug. Still held at the last update (25 Sep 2026).",
  },
];

async function main() {
  const apply = process.argv.includes("--apply");
  // Check every case before touching the database.
  for (const c of CASES) {
    if (c.note.length > 280) throw new Error(`Note too long (${c.note.length}) for ${c.sourceUrl}`);
    if (identifyingContent(c.note)) throw new Error(`Note holds identifying content: ${c.sourceUrl}`);
    if (!mondayOf(c.sentDay)) throw new Error(`Bad date ${c.sentDay}`);
  }
  const db = createDb();
  try {
    await db.transaction(async (tx) => {
      const [near] = await tx.select({ id: services.id }).from(services).where(eq(services.slug, NEAR.slug));
      if (!near) console.log(`  ${apply ? "added " : "would add"} service ${NEAR.name} (${NEAR.slug}, swap, mainnet)`);
      if (!near && apply) await tx.insert(services).values(NEAR);

      for (const c of CASES) {
        const [svc] = await tx.select({ id: services.id }).from(services).where(eq(services.slug, c.slug));
        if (!svc && !(c.slug === NEAR.slug && !apply)) throw new Error(`Service ${c.slug} not found.`);
        const [dup] = await tx.select({ id: outcomeReports.id }).from(outcomeReports).where(eq(outcomeReports.sourceUrl, c.sourceUrl));
        const label = `${c.slug} ${c.result} week of ${mondayOf(c.sentDay)}`;
        if (dup) {
          console.log(`  skip   ${label} (already stored)`);
          continue;
        }
        if (!apply) {
          console.log(`  ok     would add ${label}`);
          continue;
        }
        await tx.insert(outcomeReports).values({
          network: "mainnet",
          serviceId: svc!.id,
          result: c.result,
          amountBand: c.amountBand,
          route: c.route,
          weekOf: mondayOf(c.sentDay)!,
          daysHeld: c.daysHeld,
          sourceUrl: c.sourceUrl,
          note: c.note,
          status: "accepted",
          reviewedBy: REVIEWER,
          reviewedAt: new Date(),
        });
        console.log(`  added  ${label}`);
      }
    });
    if (!apply) console.log("Dry run: nothing changed. Re-run with --apply.");
  } finally {
    await db.$client.end();
  }
}

await main();
