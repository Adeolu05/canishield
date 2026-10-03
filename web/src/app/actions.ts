"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { and, arrayContains, eq } from "drizzle-orm";
import { reports, services, tests, addressType, type AddressType } from "@zecproof/db";
import { isNetworkId } from "@zecproof/zcash/networks";
import { getDb } from "@/lib/db";
import { basePath, canCreateTests } from "@/lib/network";
import { EVIDENCE_MAX_BYTES, FORM_CHECK_METHOD, canLogFormChecks, checkEvidence, parseFormCheck } from "@/lib/form-check";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

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

export type FormCheckState = { errors: string[] } | null;

/**
 * Files a withdrawal form check: a reference address was pasted into the
 * service's withdrawal form and NOT submitted. No key is assigned and no funds
 * move. Stored as a community report (unreviewed) with its screenshot.
 */
export async function logFormCheck(_prev: FormCheckState, formData: FormData): Promise<FormCheckState> {
  if (!canLogFormChecks()) return { errors: ["Form checks are not enabled on this deployment."] };
  const parsed = parseFormCheck((name) => formData.get(name));
  const file = formData.get("evidence");
  const errors = parsed.ok ? [] : [...parsed.errors];
  let evidence: ReturnType<typeof checkEvidence> | null = null;
  if (!(file instanceof File) || file.size === 0) errors.push("Attach the screenshot of the form.");
  else if (file.size > EVIDENCE_MAX_BYTES) errors.push("The screenshot is over 4 MB.");
  else {
    evidence = checkEvidence(new Uint8Array(await file.arrayBuffer()));
    if (!evidence.ok) errors.push(evidence.error);
  }
  if (!parsed.ok || errors.length || !evidence?.ok) return { errors };
  const input = parsed.value;

  const db = getDb();
  const [service] = await db
    .select({ id: services.id, slug: services.slug })
    .from(services)
    .where(and(eq(services.id, input.serviceId), arrayContains(services.networks, ["mainnet"])));
  if (!service) return { errors: ["That service is not on the mainnet board."] };

  // Saved under web/public/evidence with a name we choose (never the uploaded file name).
  const day = input.observedAt.toISOString().slice(0, 10);
  const name = `${service.slug}-${input.addressType}-${day}-${randomUUID().slice(0, 8)}.${evidence.format === "png" ? "png" : "jpg"}`;
  const dir = join(process.cwd(), "public", "evidence");
  await mkdir(dir, { recursive: true });
  const path = join(dir, name);
  await writeFile(path, evidence.bytes, { flag: "wx" });

  let id: string;
  try {
    const [report] = await db
      .insert(reports)
      .values({
        network: "mainnet",
        serviceId: service.id,
        tier: "community",
        method: FORM_CHECK_METHOD,
        addressType: input.addressType,
        address: input.address,
        outcome: input.result,
        errorText: input.errorText,
        observedAt: input.observedAt,
        note: input.note,
        evidenceUrl: `/api/evidence/${name}`, // served at request time; see app/api/evidence
      })
      .returning({ id: reports.id });
    id = report.id;
  } catch (e) {
    await unlink(path).catch(() => {});
    throw e;
  }
  redirect(`/services/${service.slug}#report-${id}`);
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
