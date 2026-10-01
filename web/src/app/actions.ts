"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { and, eq } from "drizzle-orm";
import { reports, tests, addressType, type AddressType } from "@zecproof/db";
import { getDb } from "@/lib/db";

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

/** Creates a pending test; the worker derives its address on the next cycle. */
export async function createTest(formData: FormData) {
  const serviceId = formData.get("serviceId");
  const type = formData.get("addressType");
  if (typeof serviceId !== "string" || !isAddressType(type)) {
    throw new Error("Pick a service and an address type.");
  }
  const [test] = await getDb()
    .insert(tests)
    .values({ serviceId, addressType: type })
    .returning({ id: tests.id });
  redirect(`/test/${test.id}`);
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
    if (!test) return; // already received, expired or rejected
    await tx.insert(reports).values({
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
