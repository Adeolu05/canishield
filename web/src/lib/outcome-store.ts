// Saves an outcome report as unreviewed. Shared by the /report/outcome action and
// tests; takes the db as a parameter so it also runs outside Next. Nothing saved
// here is public until the maintainer accepts it (web/scripts/review-outcomes.mts).
import { and, arrayContains, count, eq, gt, inArray } from "drizzle-orm";
import { outcomeReports, services, type Db } from "@zecproof/db";
import { DEPOSIT_SERVICE_KINDS } from "./deposit-core";
import { OUTCOME_COOLDOWN_DAYS, OUTCOME_MAX_PER_HOUR, type OutcomeInput } from "./outcome";

/** Services an outcome can be reported for: the ones you send ZEC to and expect something back. */
export const OUTCOME_SERVICE_KINDS = DEPOSIT_SERVICE_KINDS;

export async function saveOutcome(
  db: Db,
  input: OutcomeInput,
  reporterTokenHash: string,
  now = new Date(),
): Promise<{ ok: true; id: string; slug: string } | { ok: false; error: string }> {
  const [service] = await db
    .select({ id: services.id, slug: services.slug })
    .from(services)
    .where(and(eq(services.id, input.serviceId), arrayContains(services.networks, ["mainnet"]), inArray(services.kind, [...OUTCOME_SERVICE_KINDS])));
  if (!service) return { ok: false, error: "Outcome reports are for exchanges and swap services on the mainnet board." };

  const [{ mine }] = await db
    .select({ mine: count() })
    .from(outcomeReports)
    .where(
      and(
        eq(outcomeReports.reporterTokenHash, reporterTokenHash),
        eq(outcomeReports.serviceId, service.id),
        gt(outcomeReports.createdAt, new Date(now.getTime() - OUTCOME_COOLDOWN_DAYS * 86_400_000)),
      ),
    );
  if (mine > 0) return { ok: false, error: `You've already reported on this service in the last ${OUTCOME_COOLDOWN_DAYS} days. Thanks, one report is enough.` };

  const [{ recent }] = await db
    .select({ recent: count() })
    .from(outcomeReports)
    .where(and(eq(outcomeReports.network, "mainnet"), gt(outcomeReports.createdAt, new Date(now.getTime() - 3_600_000))));
  if (recent >= OUTCOME_MAX_PER_HOUR) return { ok: false, error: "A lot of reports came in during the last hour. Please try again a little later." };

  const [row] = await db
    .insert(outcomeReports)
    .values({
      network: "mainnet",
      serviceId: service.id,
      result: input.result,
      amountBand: input.amountBand,
      route: input.route,
      weekOf: input.weekOf,
      daysHeld: input.daysHeld,
      creditMinutes: input.creditMinutes,
      evidenceUrl: input.evidenceUrl,
      note: input.note,
      reporterTokenHash,
    })
    .returning({ id: outcomeReports.id });
  return { ok: true, id: row.id, slug: service.slug };
}
