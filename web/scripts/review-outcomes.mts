// Maintainer review of exit outcome reports (/report/outcome). Nothing counts
// until it is accepted here. Open the screenshot link (if any) before deciding;
// accepting or rejecting deletes the link in the same update.
//
//   cd web
//   npx tsx --env-file=../.env scripts/review-outcomes.mts list
//   npx tsx --env-file=../.env scripts/review-outcomes.mts accept <id> "David Peluola (maintainer)"
//   npx tsx --env-file=../.env scripts/review-outcomes.mts reject <id> "David Peluola (maintainer)"
//
// For the hosted database, set DATABASE_URL with Read-Host first instead of --env-file.
import { and, asc, eq } from "drizzle-orm";
import { createDb, outcomeReports, services } from "@zecproof/db";
import { AMOUNT_BAND_LABEL, OUTCOME_RESULT_LABEL, OUTCOME_ROUTE_LABEL } from "../src/lib/outcome";

const [cmd, id, reviewer] = process.argv.slice(2);
const db = createDb();
/** Fields typed by reporters go through JSON.stringify, so nothing in them can play tricks on this terminal. */
const q = (v: unknown) => JSON.stringify(v ?? null);
const isUuid = (v: string | undefined) => !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

try {
  if (cmd === "list") {
    const rows = await db
      .select({ r: outcomeReports, name: services.name })
      .from(outcomeReports)
      .innerJoin(services, eq(services.id, outcomeReports.serviceId))
      .where(eq(outcomeReports.status, "unreviewed"))
      .orderBy(asc(outcomeReports.createdAt));
    if (rows.length === 0) console.log("Nothing to review.");
    for (const { r, name } of rows) {
      const extra = [r.daysHeld != null ? `held ${r.daysHeld} days` : null, r.creditMinutes != null ? `credited in ~${r.creditMinutes} min` : null].filter(Boolean).join(", ");
      console.log(
        [
          `${r.id}  ${r.network}  ${q(name)}  (sent ${r.createdAt.toISOString().slice(0, 16)}Z)`,
          `  ${OUTCOME_RESULT_LABEL[r.result].title}${extra ? ` (${extra})` : ""}, ${AMOUNT_BAND_LABEL[r.amountBand]}, ${OUTCOME_ROUTE_LABEL[r.route].title}, week of ${r.weekOf}`,
          `  note ${q(r.note)}`,
          `  screenshot ${q(r.evidenceUrl)}  source ${q(r.sourceUrl)}`,
        ].join("\n"),
      );
    }
  } else if ((cmd === "accept" || cmd === "reject") && isUuid(id) && reviewer?.trim()) {
    const done = await db
      .update(outcomeReports)
      .set({ status: cmd === "accept" ? "accepted" : "rejected", reviewedBy: reviewer.trim(), reviewedAt: new Date(), evidenceUrl: null })
      .where(and(eq(outcomeReports.id, id!), eq(outcomeReports.status, "unreviewed")))
      .returning({ id: outcomeReports.id, status: outcomeReports.status });
    console.log(done.length ? `${done[0].id} → ${done[0].status}` : "No unreviewed report with that id.");
  } else {
    console.log('Usage: review-outcomes.mts list | accept <id> "<reviewer>" | reject <id> "<reviewer>"');
    process.exitCode = 1;
  }
} finally {
  await db.$client.end();
}
