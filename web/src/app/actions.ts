"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { and, eq } from "drizzle-orm";
import { tests, addressType, type AddressType } from "@zecproof/db";
import { getDb } from "@/lib/db";

const isAddressType = (v: unknown): v is AddressType =>
  typeof v === "string" && (addressType.enumValues as readonly string[]).includes(v);

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

/** Tester reports that the service's withdrawal form refused the address. */
export async function markAddressRejected(testId: string, formData: FormData) {
  const note = formData.get("note");
  await getDb()
    .update(tests)
    .set({ status: "address_rejected", testerNote: typeof note === "string" && note ? note : null })
    .where(and(eq(tests.id, testId), eq(tests.status, "awaiting_payment")));
  refresh();
}
