// Import community research claims (docs/research/*.md) into research_claims.
// Re-runnable: replaces only this source's rows. Never touches tests,
// community reports or listings.
//
//   npm run import:research -w @zecproof/db
//   npm run import:research -w @zecproof/db -- docs/research/<file>.md
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq, sql } from "drizzle-orm";
import { createDb, researchClaims, services } from "./index";
import { parseResearch } from "./research";

// Credit for this source lives in docs/CREDITS.md and web/src/lib/evidence.ts.
const SOURCE = "orb";
const READ_AT = "2026-10-02";
const NETWORK = "mainnet";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const file = resolve(repoRoot, process.argv[2] ?? "docs/research/orb-zec-research-2026-10-02-v2.md");
const sourceFile = relative(repoRoot, file).replace(/\\/g, "/");

async function main() {
  const { claims, skipped } = parseResearch(readFileSync(file, "utf8"));
  const readAt = new Date(`${READ_AT}T00:00:00Z`);
  const db = createDb();
  let created = 0;
  await db.transaction(async (tx) => {
    await tx.delete(researchClaims).where(and(eq(researchClaims.source, SOURCE), eq(researchClaims.network, NETWORK)));
    for (const c of claims) {
      // New services join the mainnet board; existing ones keep their name, kind,
      // website and notes, and gain "mainnet".
      const [svc] = await tx
        .insert(services)
        .values({ slug: c.slug, name: c.name, kind: c.kind, websiteUrl: c.website, networks: [NETWORK] })
        .onConflictDoUpdate({
          target: services.slug,
          set: { networks: sql`(SELECT ARRAY(SELECT DISTINCT unnest(${services.networks} || ARRAY['mainnet']::text[])))` },
        })
        .returning({ id: services.id, inserted: sql<boolean>`xmax = 0` });
      if (svc.inserted) created++;
      await tx.insert(researchClaims).values({
        serviceId: svc.id,
        network: NETWORK,
        source: SOURCE,
        claim: c.claim,
        product: c.product,
        detail: c.detail,
        officialUrl: c.officialUrl,
        readAt,
        sourceFile,
      });
    }
  });
  console.log(`Imported ${claims.length} research claim(s) from ${sourceFile} (source "${SOURCE}", read ${READ_AT}); ${created} new service(s).`);
  for (const s of skipped) console.log(`  skipped ${s.product}: ${s.reason}`);
  await db.$client.end();
}

await main();
