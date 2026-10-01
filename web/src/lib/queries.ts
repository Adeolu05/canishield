import "server-only";
import { connection } from "next/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { reports, services, tests, type AddressType, type Report, type Test } from "@zecproof/db";
import { getDb } from "./db";

/** A board cell: the latest conclusive evidence for one service × address type. */
export type Cell =
  | { tier: "verified"; test: Test }
  | { tier: "reported"; report: Report }
  | { tier: "none" };

const CONCLUSIVE = ["received", "address_rejected"] as const;

function latestCell(serviceTests: Test[], serviceReports: Report[], type: AddressType): Cell {
  const test = serviceTests.find((t) => t.addressType === type);
  if (test) return { tier: "verified", test };
  const report = serviceReports.find((r) => r.addressType === type);
  if (report) return { tier: "reported", report };
  return { tier: "none" };
}

export async function getBoard() {
  await connection(); // request-time data
  const db = getDb();
  const [allServices, conclusive, accepted] = await Promise.all([
    db.select().from(services).orderBy(asc(services.name)),
    db
      .select()
      .from(tests)
      .where(inArray(tests.status, [...CONCLUSIVE]))
      .orderBy(desc(tests.updatedAt)),
    db.select().from(reports).where(eq(reports.status, "accepted")).orderBy(desc(reports.createdAt)),
  ]);
  return allServices.map((service) => {
    const st = conclusive.filter((t) => t.serviceId === service.id);
    const sr = accepted.filter((r) => r.serviceId === service.id);
    return {
      service,
      cells: {
        ironwood_ua: latestCell(st, sr, "ironwood_ua"),
        full_ua: latestCell(st, sr, "full_ua"),
        transparent: latestCell(st, sr, "transparent"),
      } satisfies Record<AddressType, Cell>,
    };
  });
}

export async function getServiceDetail(slug: string) {
  await connection();
  const db = getDb();
  const [service] = await db.select().from(services).where(eq(services.slug, slug));
  if (!service) return null;
  const [serviceTests, serviceReports] = await Promise.all([
    db
      .select()
      .from(tests)
      .where(and(eq(tests.serviceId, service.id), inArray(tests.status, [...CONCLUSIVE])))
      .orderBy(desc(tests.updatedAt)),
    db.select().from(reports).where(eq(reports.serviceId, service.id)).orderBy(desc(reports.createdAt)),
  ]);
  return { service, tests: serviceTests, reports: serviceReports };
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
