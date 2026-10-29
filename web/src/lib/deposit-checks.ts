import "server-only";
// Deposit checks, server side: the switch, the HMAC secret and the queries.
import { connection } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { depositChecks, services } from "@zecproof/db";
import { depositHmac } from "@zecproof/zcash/deposit";
import { getDb } from "./db";
import { depositsEnabledFor } from "./deposit-core";
import type { NetworkId } from "./network";

const secret = () => process.env.ZECPROOF_DEPOSIT_SECRET ?? "";

/** On only when the network is switched on AND the HMAC secret is set (32+ characters). */
export const depositsEnabled = (network: NetworkId) => depositsEnabledFor(process.env.ZECPROOF_ENABLE_DEPOSIT_CHECKS, network) && secret().length >= 32;

/** Keyed hash with the deployment's secret. Throws if the secret is missing. */
export const hmacValue = (value: string) => depositHmac(secret(), value);

const isUuid = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function getDepositCheck(network: NetworkId, id: string) {
  await connection();
  if (!isUuid(id)) return null;
  const [row] = await getDb()
    .select({ check: depositChecks, service: services })
    .from(depositChecks)
    .innerJoin(services, eq(services.id, depositChecks.serviceId))
    .where(and(eq(depositChecks.id, id), eq(depositChecks.network, network)));
  return row ?? null;
}

export async function depositCheckExists(network: NetworkId, id: string) {
  await connection();
  if (!isUuid(id)) return false;
  const [row] = await getDb()
    .select({ id: depositChecks.id })
    .from(depositChecks)
    .where(and(eq(depositChecks.id, id), eq(depositChecks.network, network)));
  return Boolean(row);
}

/** Published checks only: the private fields are already NULL (the database guarantees it). */
export async function publishedDeposits(network: NetworkId, serviceId?: string) {
  await connection();
  const where = serviceId
    ? and(eq(depositChecks.network, network), eq(depositChecks.status, "published"), eq(depositChecks.serviceId, serviceId))
    : and(eq(depositChecks.network, network), eq(depositChecks.status, "published"));
  return getDb()
    .select({
      id: depositChecks.id,
      serviceId: depositChecks.serviceId,
      serviceSlug: services.slug,
      serviceName: services.name,
      addressType: depositChecks.addressType,
      uaReceivers: depositChecks.uaReceivers,
      wallet: depositChecks.wallet,
      source: depositChecks.source,
      result: depositChecks.result,
      afterNu7: depositChecks.afterNu7,
      blockTime: depositChecks.blockTime,
      creditedAt: depositChecks.creditedAt,
      confirmationsShown: depositChecks.confirmationsShown,
      reviewedBy: depositChecks.reviewedBy,
      reviewedAt: depositChecks.reviewedAt,
    })
    .from(depositChecks)
    .innerJoin(services, eq(services.id, depositChecks.serviceId))
    .where(where)
    .orderBy(desc(depositChecks.reviewedAt));
}
export type PublishedDeposit = Awaited<ReturnType<typeof publishedDeposits>>[number];
