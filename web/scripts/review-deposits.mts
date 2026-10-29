// Maintainer review of deposit checks (docs/SPEC-deposits-and-timing.md, section 10).
// Opens the credit screenshot, then publishes (clearing the private fields in the
// same update; the database refuses a published row that still has them) or refuses.
//
//   cd web
//   npx tsx --env-file=../.env scripts/review-deposits.mts list
//   npx tsx --env-file=../.env scripts/review-deposits.mts accept <id> "David Peluola (maintainer)"
//   npx tsx --env-file=../.env scripts/review-deposits.mts reject <id> "reason shown to the tester"
//
// For the hosted database, set DATABASE_URL with Read-Host first instead of --env-file.
import { and, eq, inArray } from "drizzle-orm";
import { createDb, depositChecks, services } from "@zecproof/db";

const [cmd, id, text] = process.argv.slice(2);
const db = createDb();
const CLEAR = { txid: null, checkAmountZat: null, height: null, evidenceUrl: null, addressHmac: null } as const;
/** Fields typed by testers go through JSON.stringify, so nothing in them can play tricks on this terminal. */
const q = (v: unknown) => JSON.stringify(v ?? null);
const REVIEWABLE = ["reported", "wallet_refused"] as const;

try {
  if (cmd === "list") {
    const rows = await db
      .select({ c: depositChecks, name: services.name })
      .from(depositChecks)
      .innerJoin(services, eq(services.id, depositChecks.serviceId))
      .where(inArray(depositChecks.status, [...REVIEWABLE]));
    if (rows.length === 0) console.log("Nothing to review.");
    for (const { c, name } of rows) {
      const toCredit = c.creditedAt && c.blockTime ? `${Math.round((c.creditedAt.getTime() - c.blockTime.getTime()) / 60_000)} min` : "n/a";
      console.log(
        [
          `${c.id}  ${c.network}  ${q(name)}`,
          `  status ${c.status}, result ${c.result}, address ${c.addressType}, wallet ${q(c.wallet)}, source ${c.source ?? "n/a"}${c.destinationChecked === false ? " (destination not visible)" : ""}`,
          `  landed ${c.blockTime?.toISOString() ?? "n/a"}, credited ${c.creditedAt?.toISOString() ?? "n/a"} (${toCredit}), confirmations shown ${c.confirmationsShown ?? "n/a"}`,
          `  screenshot ${q(c.evidenceUrl)}`,
        ].join("\n"),
      );
    }
  } else if ((cmd === "accept" || cmd === "reject") && id && text) {
    const set =
      cmd === "accept"
        ? { status: "published" as const, reviewedBy: text, reviewedAt: new Date(), ...CLEAR }
        : { status: "refused" as const, refusedReason: text, ...CLEAR };
    const done = await db
      .update(depositChecks)
      .set(set)
      .where(and(eq(depositChecks.id, id), inArray(depositChecks.status, [...REVIEWABLE])))
      .returning({ id: depositChecks.id, status: depositChecks.status });
    console.log(done.length ? `${done[0].id} → ${done[0].status}` : "No reviewable check with that id.");
  } else {
    console.log('Usage: review-deposits.mts list | accept <id> "<reviewer>" | reject <id> "<reason>"');
    process.exitCode = 1;
  }
} finally {
  await db.$client.end();
}
