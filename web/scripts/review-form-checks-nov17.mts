// One-off: mark the Nov 17, 2026 transparent withdrawal form checks (Binance,
// Bitget, MEXC, logged through /report/form-check) as reviewed by the
// maintainer, the same as the Oct 5 and Nov 12 checks. Each report must still
// match what was logged (service, transparent, form accepted, reference
// address, its screenshot) or nothing is changed. Dry run by default; --apply
// stores.
//
//   $env:DATABASE_URL = Read-Host -MaskInput "Railway DATABASE_URL"
//   cd web; npx tsx scripts/review-form-checks-nov17.mts [--apply]
import { eq, inArray } from "drizzle-orm";
import { createDb, reports, services } from "@zecproof/db";
import { markReviewed } from "../src/lib/form-check-store";

const REVIEWER = "David Peluola (maintainer)";
const ADDRESS = "t1UNFPmPYCyK9eNECvB51njwbjo3s3f8yzP";

const EXPECTED: Record<string, { slug: string; evidence: string }> = {
  "4332d0e2-7a7c-4cec-bb3f-180ca4d119ed": { slug: "binance", evidence: "binance-transparent-2026-11-17-4b999baf.png" },
  "7fd47890-4a62-47eb-a4d7-9b4062aad45e": { slug: "bitget", evidence: "bitget-transparent-2026-11-17-27c4728f.jpg" },
  "2ac3cd32-39f6-43a5-9c71-eabf64e129ff": { slug: "mexc", evidence: "mexc-transparent-2026-11-17-d319d5ec.jpg" },
};

async function main() {
  const apply = process.argv.includes("--apply");
  const db = createDb();
  try {
    const ids = Object.keys(EXPECTED);
    const rows = await db
      .select({
        id: reports.id,
        slug: services.slug,
        tier: reports.tier,
        status: reports.status,
        addressType: reports.addressType,
        outcome: reports.outcome,
        address: reports.address,
        evidenceUrl: reports.evidenceUrl,
      })
      .from(reports)
      .innerJoin(services, eq(services.id, reports.serviceId))
      .where(inArray(reports.id, ids));
    if (rows.length !== ids.length) throw new Error(`Expected ${ids.length} reports, found ${rows.length}.`);

    for (const r of rows) {
      const want = EXPECTED[r.id];
      const ok =
        r.slug === want.slug &&
        r.tier === "community" &&
        r.addressType === "transparent" &&
        r.outcome === "form_accepted" &&
        r.address === ADDRESS &&
        r.evidenceUrl === `/api/evidence/${want.evidence}`;
      if (!ok) throw new Error(`Report ${r.id} (${r.slug}) does not match what was logged; nothing changed.`);
      console.log(`  ok     ${r.slug} transparent form_accepted (status ${r.status})`);
    }

    if (!apply) {
      console.log(`  dry    would mark ${ids.length} report(s) reviewed by ${REVIEWER}; run with --apply to store`);
      return;
    }
    const marked = await markReviewed(db, ids, REVIEWER);
    console.log(`  saved  ${marked.length} report(s) marked reviewed by ${REVIEWER}`);
  } finally {
    await db.$client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
