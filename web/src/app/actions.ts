"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { and, arrayContains, eq } from "drizzle-orm";
import { reports, services, tests, addressType, type AddressType } from "@zecproof/db";
import { isNetworkId } from "@zecproof/zcash/networks";
import { getDb } from "@/lib/db";
import { basePath, canCreateTests } from "@/lib/network";

const isAddressType = (v: unknown): v is AddressType =>
  typeof v === "string" && (addressType.enumValues as readonly string[]).includes(v);

const optionalText = (v: FormDataEntryValue | null) => (typeof v === "string" && v.trim() ? v.trim() : null);

const optionalUrl = (v: FormDataEntryValue | null) => {
  const s = optionalText(v);
  if (!s) return null;
  try {
    const url = new URL(s);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
};

/** Creates a pending test; the worker for that network assigns its address. */
export async function createTest(formData: FormData) {
  const network = formData.get("network");
  const serviceId = formData.get("serviceId");
  const type = formData.get("addressType");
  if (!isNetworkId(network)) throw new Error("Unknown network.");
  if (!canCreateTests(network)) throw new Error("Mainnet tests are not enabled.");
  if (typeof serviceId !== "string" || !isAddressType(type)) throw new Error("Pick a service and an address type.");

  const db = getDb();
  const [service] = await db
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.id, serviceId), arrayContains(services.networks, [network])));
  if (!service) throw new Error(`That service is not listed on ${network}.`);

  const [test] = await db
    .insert(tests)
    .values({ network, serviceId, addressType: type })
    .returning({ id: tests.id });
  redirect(`${basePath(network)}/test/${test.id}`);
}

/**
 * Tester says the service's form refused the address. That cannot be proven
 * on-chain, so it closes the test and files a community report for review.
 */
export async function markAddressRejected(testId: string, formData: FormData) {
  const note = optionalText(formData.get("note"));
  const evidenceUrl = optionalUrl(formData.get("evidenceUrl"));
  await getDb().transaction(async (tx) => {
    const [test] = await tx
      .update(tests)
      .set({ status: "address_rejected", testerNote: note })
      .where(and(eq(tests.id, testId), eq(tests.status, "awaiting_payment")))
      .returning();
    if (!test) return; // already seen, received, expired or rejected
    await tx.insert(reports).values({
      network: test.network,
      serviceId: test.serviceId,
      tier: "community",
      testId: test.id,
      addressType: test.addressType,
      outcome: "address_rejected",
      evidenceUrl,
      note,
    });
  });
  refresh();
}
