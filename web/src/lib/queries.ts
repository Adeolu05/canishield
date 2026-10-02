import "server-only";
import { connection } from "next/server";
import { and, arrayContains, asc, desc, eq, ne } from "drizzle-orm";
import { reports, researchClaims, services, tests, workerHeartbeats } from "@zecproof/db";
import { summarize } from "./evidence";
import { getDb } from "./db";
import type { NetworkId } from "./network";

// Every query takes the network explicitly; nothing defaults to one.

type Db = ReturnType<typeof getDb>;

// Only tests whose receipt passed every check are evidence. A tester's
// "rejected" mark becomes a community report instead (see markAddressRejected).
const verifiedTests = (db: Db, network: NetworkId, serviceId?: string) =>
  db
    .select()
    .from(tests)
    .where(
      and(
        eq(tests.network, network),
        eq(tests.status, "received"),
        serviceId ? eq(tests.serviceId, serviceId) : undefined,
      ),
    )
    .orderBy(desc(tests.receivedAt));

// Unreviewed reports show (marked as such) until an admin rejects them.
const visibleReports = (db: Db, network: NetworkId, serviceId?: string) =>
  db
    .select()
    .from(reports)
    .where(
      and(
        eq(reports.network, network),
        ne(reports.status, "rejected"),
        serviceId ? eq(reports.serviceId, serviceId) : undefined,
      ),
    )
    .orderBy(desc(reports.createdAt));

// Community research claims: shown beside listings, never mixed into cells or readiness.
const researchOn = (db: Db, network: NetworkId, serviceId?: string) =>
  db
    .select()
    .from(researchClaims)
    .where(and(eq(researchClaims.network, network), serviceId ? eq(researchClaims.serviceId, serviceId) : undefined))
    .orderBy(asc(researchClaims.source));

const servicesOn = (db: Db, network: NetworkId) =>
  db.select().from(services).where(arrayContains(services.networks, [network])).orderBy(asc(services.name));

/** Board rows (cells + readiness) and the readiness counts for one network. */
export async function getBoard(network: NetworkId) {
  const { summary, research } = await getResults(network);
  return { ...summary, research };
}

/** Everything the board and /api/results.json are built from. */
export async function getResults(network: NetworkId) {
  await connection(); // request-time data
  const db = getDb();
  const [allServices, verified, visible, research] = await Promise.all([
    servicesOn(db, network),
    verifiedTests(db, network),
    visibleReports(db, network),
    researchOn(db, network),
  ]);
  return { services: allServices, verified, visible, research, summary: summarize(allServices, verified, visible) };
}

export async function getServiceDetail(network: NetworkId, slug: string) {
  await connection();
  const db = getDb();
  const [service] = await db
    .select()
    .from(services)
    .where(and(eq(services.slug, slug), arrayContains(services.networks, [network])));
  if (!service) return null;
  const [verified, visible, research] = await Promise.all([
    verifiedTests(db, network, service.id),
    visibleReports(db, network, service.id),
    researchOn(db, network, service.id),
  ]);
  return {
    service,
    tests: verified,
    communityReports: visible.filter((r) => r.tier === "community"),
    listings: visible.filter((r) => r.tier === "listing"),
    research,
  };
}

export async function listServices(network: NetworkId) {
  await connection();
  return servicesOn(getDb(), network);
}

/** A test is only visible under its own network's routes. */
export async function getTest(network: NetworkId, id: string) {
  await connection();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await getDb()
    .select({ test: tests, service: services })
    .from(tests)
    .innerJoin(services, eq(services.id, tests.serviceId))
    .where(and(eq(tests.id, id), eq(tests.network, network)));
  return row ?? null;
}

/** Cheap existence checks, run in segment layouts before the page streams, so unknown ids get a real 404. */
export async function serviceExists(network: NetworkId, slug: string) {
  await connection();
  const [row] = await getDb()
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.slug, slug), arrayContains(services.networks, [network])));
  return Boolean(row);
}

export async function testExists(network: NetworkId, id: string) {
  await connection();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const [row] = await getDb()
    .select({ id: tests.id })
    .from(tests)
    .where(and(eq(tests.id, id), eq(tests.network, network)));
  return Boolean(row);
}

/** The newest verified test on a network, with its service: the hero's "Latest proof". */
export async function getLatestProof(network: NetworkId) {
  await connection();
  const [row] = await getDb()
    .select({ test: tests, service: services })
    .from(tests)
    .innerJoin(services, eq(services.id, tests.serviceId))
    .where(and(eq(tests.network, network), eq(tests.status, "received")))
    .orderBy(desc(tests.receivedAt))
    .limit(1);
  return row ?? null;
}

/** The worker's last heartbeat for a network, if any. */
export async function getScannerHeartbeat(network: NetworkId) {
  await connection();
  const [row] = await getDb().select().from(workerHeartbeats).where(eq(workerHeartbeats.network, network));
  return row ?? null;
}
