import "server-only";
import { connection } from "next/server";
import { and, arrayContains, asc, desc, eq, isNotNull, ne } from "drizzle-orm";
import { fundingEvents, fundingStatus, outcomeReports, reports, researchClaims, services, tests, workerHeartbeats, type AddressType } from "@zecproof/db";
import type { OutcomeRow } from "./outcome-record";
import type { LiveEvent, LiveRow } from "./live";
import { summarize } from "./evidence";
import { getDb } from "./db";
import type { NetworkId } from "./network";
import { DEPOSIT_SERVICE_KINDS } from "./deposit-core";

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
  const { summary, research, visible } = await getResults(network);
  return { ...summary, research, visible };
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

/**
 * The addresses pasted into withdrawal forms for form checks: the newest
 * mainnet Trust Wallet test address of each type. Already public on the board.
 */
export async function getReferenceAddresses(): Promise<Partial<Record<AddressType, string>>> {
  await connection();
  const rows = await getDb()
    .select({ addressType: tests.addressType, address: tests.receiveAddress })
    .from(tests)
    .innerJoin(services, eq(services.id, tests.serviceId))
    .where(and(eq(services.slug, "trust-wallet"), eq(tests.network, "mainnet"), isNotNull(tests.receiveAddress)))
    .orderBy(desc(tests.createdAt));
  const out: Partial<Record<AddressType, string>> = {};
  for (const r of rows) out[r.addressType] ??= r.address!;
  return out;
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
/** A mainnet service that takes deposits (exchanges and swaps), for the embed and its JSON. */
export async function depositService(slug: string) {
  await connection();
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) return null;
  const [row] = await getDb()
    .select({ id: services.id, slug: services.slug, name: services.name, kind: services.kind })
    .from(services)
    .where(and(eq(services.slug, slug), arrayContains(services.networks, ["mainnet"])));
  return row && (DEPOSIT_SERVICE_KINDS as readonly string[]).includes(row.kind) ? row : null;
}

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

/**
 * Accepted exit outcome reports, newest week first, with only the columns that may be shown
 * (see lib/outcome-record.ts for which of them a page actually shows). Never the evidence link
 * or the reporter token hash. Unreviewed and rejected reports never leave the database.
 */
export async function acceptedOutcomes(network: NetworkId, serviceId?: string): Promise<(OutcomeRow & { serviceSlug: string; serviceName: string })[]> {
  await connection();
  return getDb()
    .select({
      id: outcomeReports.id,
      serviceId: outcomeReports.serviceId,
      serviceSlug: services.slug,
      serviceName: services.name,
      result: outcomeReports.result,
      amountBand: outcomeReports.amountBand,
      route: outcomeReports.route,
      weekOf: outcomeReports.weekOf,
      daysHeld: outcomeReports.daysHeld,
      creditMinutes: outcomeReports.creditMinutes,
      sourceUrl: outcomeReports.sourceUrl,
      note: outcomeReports.note,
    })
    .from(outcomeReports)
    .innerJoin(services, eq(services.id, outcomeReports.serviceId))
    .where(
      and(
        eq(outcomeReports.network, network),
        eq(outcomeReports.status, "accepted"),
        serviceId ? eq(outcomeReports.serviceId, serviceId) : undefined,
      ),
    )
    .orderBy(desc(outcomeReports.weekOf), desc(outcomeReports.createdAt));
}

const liveColumns = {
  slug: services.slug,
  name: services.name,
  source: fundingStatus.source,
  deposit: fundingStatus.deposit,
  withdraw: fundingStatus.withdraw,
  confirmations: fundingStatus.confirmations,
  note: fundingStatus.note,
  checkedAt: fundingStatus.checkedAt,
  lastOkAt: fundingStatus.lastOkAt,
  changedAt: fundingStatus.changedAt,
};

/** Live ZEC deposit/withdrawal status of every exchange the worker reads, by name. Mainnet only. */
export async function liveStatuses(): Promise<LiveRow[]> {
  await connection();
  return getDb()
    .select(liveColumns)
    .from(fundingStatus)
    .innerJoin(services, eq(services.id, fundingStatus.serviceId))
    .where(arrayContains(services.networks, ["mainnet"]))
    .orderBy(asc(services.name));
}

/** One service's live status, if the worker reads it. */
export async function liveStatusFor(serviceId: string): Promise<LiveRow | null> {
  await connection();
  const [row] = await getDb()
    .select(liveColumns)
    .from(fundingStatus)
    .innerJoin(services, eq(services.id, fundingStatus.serviceId))
    .where(eq(fundingStatus.serviceId, serviceId));
  return row ?? null;
}

/** Confirmed open/paused changes, newest first. */
export async function recentLiveEvents(limit = 50): Promise<LiveEvent[]> {
  await connection();
  return getDb()
    .select({ slug: services.slug, name: services.name, side: fundingEvents.side, fromState: fundingEvents.fromState, toState: fundingEvents.toState, at: fundingEvents.at })
    .from(fundingEvents)
    .innerJoin(services, eq(services.id, fundingEvents.serviceId))
    .orderBy(desc(fundingEvents.at))
    .limit(limit);
}
