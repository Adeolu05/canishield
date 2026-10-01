import "server-only";
import { connection } from "next/server";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { reports, services, tests, type AddressType, type Report, type Test } from "@zecproof/db";
import { getDb } from "./db";

/**
 * A board cell: the strongest evidence for one service × address type.
 * On-chain verified beats community reported beats unverified listing; within
 * a tier, the newest wins.
 */
export type Cell =
  | { tier: "verified"; test: Test }
  | { tier: "community" | "listing"; report: Report }
  | { tier: "none" };

function bestCell(verified: Test[], serviceReports: Report[], type: AddressType): Cell {
  const test = verified.find((t) => t.addressType === type);
  if (test) return { tier: "verified", test };
  for (const tier of ["community", "listing"] as const) {
    const report = serviceReports.find((r) => r.tier === tier && r.addressType === type);
    if (report) return { tier, report };
  }
  return { tier: "none" };
}

// Only tests with an on-chain receipt are evidence; a tester's "rejected"
// mark becomes a community report instead (see markAddressRejected).
const receivedTests = (db: ReturnType<typeof getDb>, serviceId?: string) =>
  db
    .select()
    .from(tests)
    .where(serviceId ? and(eq(tests.status, "received"), eq(tests.serviceId, serviceId)) : eq(tests.status, "received"))
    .orderBy(desc(tests.receivedAt));

// Unreviewed reports show (marked as such) until an admin rejects them.
const visibleReports = (db: ReturnType<typeof getDb>, serviceId?: string) =>
  db
    .select()
    .from(reports)
    .where(serviceId ? and(ne(reports.status, "rejected"), eq(reports.serviceId, serviceId)) : ne(reports.status, "rejected"))
    .orderBy(desc(reports.createdAt));

export async function getBoard() {
  await connection(); // request-time data
  const db = getDb();
  const [allServices, verified, visible] = await Promise.all([
    db.select().from(services).orderBy(asc(services.name)),
    receivedTests(db),
    visibleReports(db),
  ]);
  return allServices.map((service) => {
    const st = verified.filter((t) => t.serviceId === service.id);
    const sr = visible.filter((r) => r.serviceId === service.id);
    return {
      service,
      cells: {
        ironwood_ua: bestCell(st, sr, "ironwood_ua"),
        full_ua: bestCell(st, sr, "full_ua"),
        transparent: bestCell(st, sr, "transparent"),
      } satisfies Record<AddressType, Cell>,
    };
  });
}

export async function getServiceDetail(slug: string) {
  await connection();
  const db = getDb();
  const [service] = await db.select().from(services).where(eq(services.slug, slug));
  if (!service) return null;
  const [verified, visible] = await Promise.all([receivedTests(db, service.id), visibleReports(db, service.id)]);
  return {
    service,
    tests: verified,
    communityReports: visible.filter((r) => r.tier === "community"),
    listings: visible.filter((r) => r.tier === "listing"),
  };
}

export async function listServices() {
  await connection();
  return getDb().select().from(services).orderBy(asc(services.name));
}

export async function getTest(id: string) {
  await connection();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await getDb()
    .select({ test: tests, service: services })
    .from(tests)
    .innerJoin(services, eq(services.id, tests.serviceId))
    .where(eq(tests.id, id));
  return row ?? null;
}
