// Maintainer tool: makes the scanner look at a test's blocks again, from the
// test's own starting block. Use it after a scanner fix, for a payment the old
// scanner skipped. Only tests still awaiting payment are touched; nothing else
// about the test changes.
//
//   cd web
//   $env:DATABASE_URL = Read-Host "Railway DATABASE_URL" -MaskInput
//   npx tsx scripts/rescan-test.mts <test id>
//   Remove-Item Env:DATABASE_URL
import { and, eq } from "drizzle-orm";
import { createDb, tests } from "@zecproof/db";

const id = process.argv[2] ?? "";
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
  console.log("Usage: rescan-test.mts <test id>");
  process.exit(1);
}
const db = createDb();
try {
  const done = await db
    .update(tests)
    .set({ scannedToHeight: null, error: null })
    .where(and(eq(tests.id, id), eq(tests.status, "awaiting_payment")))
    .returning({ id: tests.id, from: tests.birthdayHeight });
  console.log(done.length ? `${id} → rescanning from block ${done[0].from}` : `${id} skipped (not awaiting payment, or not found)`);
} finally {
  await db.$client.end();
}
