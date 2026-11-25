// Maintainer tool: closes tests that were opened by mistake (for example repeat
// clicks) before anything was paid to them. Only tests that are still pending or
// awaiting payment, with no payment seen, are touched; they become "expired",
// exactly as if their 48 hours had run out. A key that was already assigned is
// never handed out again (one seed per test), so this only stops the waiting.
//
//   cd web
//   $env:DATABASE_URL = Read-Host "Railway DATABASE_URL" -MaskInput
//   npx tsx scripts/expire-tests.mts list
//   npx tsx scripts/expire-tests.mts expire <test id> [<test id> ...]
//   Remove-Item Env:DATABASE_URL
import { and, eq, inArray, isNull } from "drizzle-orm";
import { createDb, services, tests } from "@zecproof/db";

const [cmd, ...ids] = process.argv.slice(2);
const db = createDb();
const OPEN = ["pending", "awaiting_payment"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

try {
  if (cmd === "list") {
    const rows = await db
      .select({ id: tests.id, network: tests.network, status: tests.status, type: tests.addressType, created: tests.createdAt, name: services.name })
      .from(tests)
      .innerJoin(services, eq(services.id, tests.serviceId))
      .where(and(inArray(tests.status, [...OPEN]), isNull(tests.receivedTxid)))
      .orderBy(tests.createdAt);
    if (rows.length === 0) console.log("No open tests.");
    for (const r of rows) console.log(`${r.id}  ${r.network}  ${r.status}  ${r.type}  ${r.created.toISOString()}  ${JSON.stringify(r.name)}`);
  } else if (cmd === "expire" && ids.length > 0) {
    const bad = ids.filter((id) => !UUID.test(id));
    if (bad.length) throw new Error(`Not a test id: ${bad.join(", ")}`);
    const done = await db
      .update(tests)
      .set({ status: "expired", error: "Closed by the maintainer: opened by mistake, nothing was paid." })
      .where(and(inArray(tests.id, ids), inArray(tests.status, [...OPEN]), isNull(tests.receivedTxid)))
      .returning({ id: tests.id });
    for (const { id } of done) console.log(`${id} → expired`);
    const skipped = ids.filter((id) => !done.some((d) => d.id === id));
    for (const id of skipped) console.log(`${id} skipped (not open, already paid, or not found)`);
  } else {
    console.log("Usage: list | expire <test id> [<test id> ...]");
    process.exitCode = 1;
  }
} finally {
  await db.$client.end();
}
