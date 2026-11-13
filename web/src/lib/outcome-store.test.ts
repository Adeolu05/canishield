// Runs against a real Postgres only when TEST_DATABASE_URL points at a migrated,
// throwaway database (it inserts and deletes rows). Skipped otherwise.
import { test } from "node:test";
import assert from "node:assert/strict";
import { and, count, eq, gt, inArray } from "drizzle-orm";
import { createDb, outcomeReports, services } from "@zecproof/db";
import { saveOutcome } from "./outcome-store";
import { OUTCOME_MAX_PER_HOUR, type OutcomeInput } from "./outcome";

const url = process.env.TEST_DATABASE_URL;

test("saveOutcome: unreviewed, one per browser per service per month, capped per hour", { skip: !url && "set TEST_DATABASE_URL to run" }, async () => {
  const db = createDb(url);
  const slugs = ["test-outcome-exchange", "test-outcome-wallet", "test-outcome-testnet"];
  try {
    await db.delete(services).where(inArray(services.slug, slugs));
    const [ex, wallet, testnetOnly] = await db
      .insert(services)
      .values([
        { slug: slugs[0], name: "Test exchange", kind: "exchange", networks: ["mainnet"] },
        { slug: slugs[1], name: "Test wallet", kind: "wallet", networks: ["mainnet"] },
        { slug: slugs[2], name: "Test testnet exchange", kind: "exchange", networks: ["testnet"] },
      ])
      .returning({ id: services.id });
    const input = (serviceId: string): OutcomeInput => ({
      serviceId, result: "credited", amountBand: "under_1", route: "via_tex", weekOf: "2026-11-09",
      daysHeld: null, creditMinutes: 10, evidenceUrl: "https://imgur.com/a/x", note: null,
    });

    const first = await saveOutcome(db, input(ex.id), "a".repeat(64));
    assert.ok(first.ok);
    const [row] = await db.select().from(outcomeReports).where(eq(outcomeReports.id, first.id));
    assert.equal(row.status, "unreviewed");
    assert.equal(row.reporterTokenHash, "a".repeat(64));

    const again = await saveOutcome(db, input(ex.id), "a".repeat(64));
    assert.equal(again.ok, false, "same browser, same service, same month");
    const other = await saveOutcome(db, input(ex.id), "b".repeat(64));
    assert.ok(other.ok, "another browser can report");
    const later = await saveOutcome(db, input(ex.id), "a".repeat(64), new Date(Date.now() + 31 * 86_400_000));
    assert.ok(later.ok, "the same browser again after 30 days");

    assert.equal((await saveOutcome(db, input(wallet.id), "c".repeat(64))).ok, false, "wallets are not outcome services");
    assert.equal((await saveOutcome(db, input(testnetOnly.id), "c".repeat(64))).ok, false, "mainnet board only");

    // The hourly backstop, across all browsers.
    await db.delete(outcomeReports).where(eq(outcomeReports.serviceId, ex.id));
    const [{ n }] = await db
      .select({ n: count() })
      .from(outcomeReports)
      .where(and(eq(outcomeReports.network, "mainnet"), gt(outcomeReports.createdAt, new Date(Date.now() - 3_600_000))));
    for (let i = n; i < OUTCOME_MAX_PER_HOUR; i++) {
      assert.ok((await saveOutcome(db, input(ex.id), String(i).padStart(64, "0"))).ok);
    }
    const capped = await saveOutcome(db, input(ex.id), "d".repeat(64));
    assert.equal(capped.ok, false);

    // The database itself refuses rows the form could never produce.
    await assert.rejects(db.insert(outcomeReports).values({ ...input(ex.id), network: "mainnet", weekOf: "2026-11-10" }), "week_of must be a Monday");
    await assert.rejects(db.insert(outcomeReports).values({ ...input(ex.id), network: "mainnet", creditMinutes: 12 }), "credit minutes in steps of 5");
    await assert.rejects(db.insert(outcomeReports).values({ ...input(ex.id), network: "mainnet", result: "held_open", creditMinutes: null }), "held needs days held");
    await assert.rejects(db.insert(outcomeReports).values({ ...input(ex.id), network: "mainnet", status: "accepted" }), "accepted needs a reviewer");
  } finally {
    await db.delete(services).where(inArray(services.slug, slugs));
    await db.$client.end();
  }
});
