// One-off (Oct 5, 2026), maintainer actions:
//  1. Attach screenshots to the existing Oct 2 Trust Wallet "address rejected"
//     reports (no new reports). Each screenshot's address, transcribed below,
//     must equal the report's own test address. Same checks as the form-check
//     flow: checkEvidence (PNG/JPEG bytes, size, metadata stripped), then
//     attachEvidence (generated name under public/evidence).
//  2. Mark the nine Oct 5 exchange form checks and those two reports as
//     reviewed by the maintainer, recording who and when.
// Dry run by default; --apply writes.
//
//   cd web && npx tsx --env-file=../.env scripts/attach-and-review-oct5.mts [--apply]
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { createDb, reports, services, tests, type AddressType } from "@zecproof/db";
import { FORM_CHECK_METHOD, checkEvidence } from "../src/lib/form-check";
import { attachEvidence, markReviewed } from "../src/lib/form-check-store";

const DIR = "C:\\Users\\USER\\Downloads\\zecproof_exchanges_test\\trust-wallet";
const REVIEWER = "David Peluola (maintainer)";
const ERROR_TEXT = "Enter a valid address";

// The address as it appears in each screenshot, line by line, joined.
const SCREENSHOTS: { type: AddressType; file: string; shown: string }[] = [
  {
    type: "ironwood_ua",
    file: "trust-wallet-ironwood.jpg",
    shown: ["u1a5qtpxl7fl6cz6nrmcpnhpa2kgmxyreat94j7a0vsmxyf3ggu", "flq48rkfm5e88ydcqcj9vr32jp2094p40qgm6hrps69g7t37y", "wdm0fj"].join(""),
  },
  {
    type: "full_ua",
    file: "trust-wallet-fullua.jpg",
    shown: [
      "u1htzfjg489ed68p2zwr9m282q5psrm2lnscy9suw94gx9lek",
      "hq6jg72qd2w454mnvfk0a486g6p80r6k7jch99wcsac6thl84",
      "vzvlyduh36rkc309mxn7zr372yg3f6kkl6yxc3e2ttm",
    ].join(""),
  },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const db = createDb();
  try {
    const reviewIds: string[] = [];

    // 1. Trust Wallet screenshots onto the existing reports.
    for (const s of SCREENSHOTS) {
      const found = await db
        .select({ id: reports.id, evidenceUrl: reports.evidenceUrl, testAddress: tests.receiveAddress })
        .from(reports)
        .innerJoin(services, eq(services.id, reports.serviceId))
        .innerJoin(tests, eq(tests.id, reports.testId))
        .where(
          and(
            eq(services.slug, "trust-wallet"),
            eq(reports.network, "mainnet"),
            eq(reports.tier, "community"),
            eq(reports.outcome, "address_rejected"),
            eq(reports.addressType, s.type),
            isNull(reports.method),
            sql`${reports.createdAt}::date = '2026-10-02'::date`,
          ),
        );
      if (found.length !== 1) throw new Error(`Expected one Oct 2 Trust Wallet ${s.type} report, found ${found.length}.`);
      const [r] = found;
      reviewIds.push(r.id);
      if (s.shown !== r.testAddress) throw new Error(`${s.file}: the address in the screenshot does not match report ${r.id}'s test address.`);
      const bytes = new Uint8Array(await readFile(join(DIR, s.file)));
      const evidence = checkEvidence(bytes);
      if (!evidence.ok) throw new Error(`${s.file}: ${evidence.error}`);
      const line = `${s.type.padEnd(12)} report ${r.id}: address matches the test address (${s.shown.length} chars); ${bytes.length} B -> ${evidence.bytes.length} B`;
      if (r.evidenceUrl?.startsWith("/api/evidence/")) {
        console.log(`  skip   ${line}; screenshot already attached`);
        continue;
      }
      if (!apply) {
        console.log(`  ok     ${line}; would replace ${r.evidenceUrl ?? "no link"}`);
        continue;
      }
      const res = await attachEvidence(db, r.id, evidence, { errorText: ERROR_TEXT, address: s.shown });
      if (!res.ok) throw new Error(`${s.file}: ${res.error}`);
      console.log(`  saved  ${line} -> public/evidence/${res.file}; replaced ${res.previousEvidenceUrl ?? "no earlier link"}`);
    }

    // 2. The nine Oct 5 exchange form checks.
    const checks = await db
      .select({ id: reports.id, slug: services.slug })
      .from(reports)
      .innerJoin(services, eq(services.id, reports.serviceId))
      .where(
        and(
          eq(reports.method, FORM_CHECK_METHOD),
          inArray(services.slug, ["bitget", "mexc", "binance"]),
          sql`${reports.observedAt}::date = '2026-10-05'::date`,
        ),
      );
    if (checks.length !== 9) throw new Error(`Expected nine Oct 5 form checks, found ${checks.length}.`);
    reviewIds.push(...checks.map((c) => c.id));

    if (!apply) {
      console.log(`  ok     would mark ${reviewIds.length} report(s) reviewed by ${REVIEWER}`);
      console.log("\nDry run: nothing written. Re-run with --apply.");
      return;
    }
    const marked = await markReviewed(db, reviewIds, REVIEWER);
    console.log(`  saved  ${marked.length} report(s) marked reviewed by ${REVIEWER}`);
  } finally {
    await db.$client.end();
  }
}

await main();
