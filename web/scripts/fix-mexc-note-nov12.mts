// One-off: add a caveat to the Nov 12, 2026 MEXC full-UA form check. The
// address field in that screenshot scrolls, so only the first three lines of
// the address show. The result (rejected, with the error visible) is unchanged;
// only the note gains the caveat. Dry run by default; --apply writes.
//
//   cd web && npx tsx scripts/fix-mexc-note-nov12.mts [--apply]
import { and, eq } from "drizzle-orm";
import { createDb, reports } from "@zecproof/db";

const REPORT_ID = "2d6f15cd-d45c-4b47-a6cd-0494d4ba9a1e";
const OLD_NOTE = "MEXC app. First check after NU7 (block 3,543,405).";
const NEW_NOTE =
  "MEXC app. The address field scrolls, so the screenshot shows the first three lines. First check after NU7 (block 3,543,405).";

async function main() {
  const apply = process.argv.includes("--apply");
  const db = createDb();
  try {
    const [row] = await db
      .select({ id: reports.id, note: reports.note, addressType: reports.addressType })
      .from(reports)
      .where(eq(reports.id, REPORT_ID));
    if (!row) throw new Error(`Report ${REPORT_ID} not found.`);
    if (row.addressType !== "full_ua") throw new Error(`Report ${REPORT_ID} is not the full_ua check.`);
    if (row.note === NEW_NOTE) {
      console.log("Already updated, nothing to do.");
      return;
    }
    if (row.note !== OLD_NOTE) throw new Error(`Unexpected note, not changing it: ${row.note}`);
    if (!apply) {
      console.log(`  ok     would update the note on ${REPORT_ID}\nDry run: nothing changed. Re-run with --apply.`);
      return;
    }
    const updated = await db
      .update(reports)
      .set({ note: NEW_NOTE })
      .where(and(eq(reports.id, REPORT_ID), eq(reports.note, OLD_NOTE)))
      .returning({ id: reports.id });
    console.log(`  updated ${updated.length} report(s).`);
  } finally {
    await db.$client.end();
  }
}

await main();
