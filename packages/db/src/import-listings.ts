// npm run import:zechub -w @zecproof/db
//
// Imports a listing snapshot (data/*.json) as "Unverified listing" reports on
// mainnet. Idempotent: listing reports from the same source are replaced in
// one transaction; tests and community reports are never touched.
import { readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { createDb, reports, services, type AddressType, type ReportOutcome } from "./index";
import { listingNote, parseSnapshot } from "./listings";

async function main() {
  const path = process.argv[2] ?? new URL("../data/zechub-custodial-exchanges.json", import.meta.url);
  const snap = parseSnapshot(JSON.parse(readFileSync(path, "utf8")));
  const readAt = new Date(`${snap.source.readAt}T00:00:00Z`);
  const db = createDb();
  let claims = 0;
  await db.transaction(async (tx) => {
    for (const e of snap.exchanges) {
      // New services join the mainnet board; existing ones keep their data and gain "mainnet".
      const [svc] = await tx
        .insert(services)
        .values({
          slug: e.slug,
          name: e.name,
          kind: "exchange",
          websiteUrl: e.website,
          notes: `Listed on ${snap.source.name} (read ${snap.source.readAt}). Not yet tested by ZecProof.`,
          networks: ["mainnet"],
        })
        .onConflictDoUpdate({
          target: services.slug,
          set: { networks: sql`(SELECT ARRAY(SELECT DISTINCT unnest(${services.networks} || ARRAY['mainnet']::text[])))` },
        })
        .returning({ id: services.id });

      await tx
        .delete(reports)
        .where(and(eq(reports.serviceId, svc.id), eq(reports.tier, "listing"), eq(reports.sourceUrl, snap.source.url)));
      const rows = Object.entries(e.claims).map(([type, outcome]) => ({
        network: "mainnet",
        serviceId: svc.id,
        tier: "listing" as const,
        addressType: type as AddressType,
        outcome: outcome as ReportOutcome,
        sourceUrl: snap.source.url,
        sourceReadAt: readAt,
        note: listingNote(snap, e),
        // Listings are not reviewed claims; "accepted" here means "imported as published".
        status: "accepted" as const,
      }));
      if (rows.length) await tx.insert(reports).values(rows);
      claims += rows.length;
    }
  });
  console.log(`Imported ${claims} listing claim(s) for ${snap.exchanges.length} service(s) from ${snap.source.url} (read ${snap.source.readAt}).`);
  await db.$client.end();
}

await main();
