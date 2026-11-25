"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { and, arrayContains, count, eq, isNull } from "drizzle-orm";
import { keyPool, reports, services, tests, addressType, type AddressType } from "@zecproof/db";
import { isNetworkId } from "@zecproof/zcash/networks";
import { getDb } from "@/lib/db";
import { basePath, canCreateTests } from "@/lib/network";
import { EVIDENCE_MAX_BYTES, canLogFormChecks, checkEvidence, parseFormCheck } from "@/lib/form-check";
import { saveFormCheck } from "@/lib/form-check-store";
import { parseRequestedAt } from "@/lib/timing";
import { isTester, newTesterToken, setTesterCookie } from "@/lib/tester-token";
import { OPEN_TESTS_COOKIE, STILL_OPEN, openTestKey, parseOpenTests, poolIsFull, rememberOpenTest } from "@/lib/open-tests-core";

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

  // Clicking again (or going back and resubmitting) reopens this browser's own
  // test for the same service and address type instead of using up another key.
  const jar = await cookies();
  const open = parseOpenTests(jar.get(OPEN_TESTS_COOKIE)?.value);
  const openKey = openTestKey(network, serviceId, type);
  const existingId = open[openKey];
  if (existingId) {
    const [existing] = await db.select({ id: tests.id, status: tests.status }).from(tests).where(eq(tests.id, existingId));
    if (existing && (STILL_OPEN as readonly string[]).includes(existing.status)) {
      redirect(`${basePath(network)}/test/${existing.id}`);
    }
  }

  // Mainnet keys come from a fixed, offline-made pool: don't queue more tests
  // than there are keys left to give them.
  if (network === "mainnet") {
    const [[{ waiting }], [{ available }]] = await Promise.all([
      db.select({ waiting: count() }).from(tests).where(and(eq(tests.network, network), eq(tests.status, "pending"))),
      db.select({ available: count() }).from(keyPool).where(and(eq(keyPool.network, network), eq(keyPool.status, "available"))),
    ]);
    if (poolIsFull(waiting, available)) redirect(`${basePath(network)}/test?busy=1`);
  }

  const { token, hash } = newTesterToken();
  const [test] = await db
    .insert(tests)
    .values({ network, serviceId, addressType: type, testerTokenHash: hash })
    .returning({ id: tests.id });
  await setTesterCookie(test.id, token, `${basePath(network)}/test/${test.id}`);
  jar.set(OPEN_TESTS_COOKIE, JSON.stringify(rememberOpenTest(open, openKey, test.id)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 3 * 24 * 3600, // a test stays open 48 h at most
  });
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
  const saved = await saveFormCheck(getDb(), parsed.value, evidence);
  if (!saved.ok) return { errors: [saved.error] };
  redirect(`/services/${saved.slug}#report-${saved.id}`);
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

export type RequestedAtState = { error: string } | null;

/**
 * The tester says when they clicked "withdraw". Tester-reported, so it is only
 * ever shown as such; the block time comes from the chain. Settable once, only
 * from the browser that created the test (cookie token), while the test is open
 * or after it is verified.
 */
export async function setRequestedAt(testId: string, _prev: RequestedAtState, formData: FormData): Promise<RequestedAtState> {
  const db = getDb();
  const [test] = await db.select().from(tests).where(eq(tests.id, testId));
  if (!test) return { error: "Test not found." };
  if (!(await isTester(test.id, test.testerTokenHash))) return { error: "Only the browser that started this test can add its request time." };
  if (!["awaiting_payment", "confirming", "received"].includes(test.status)) return { error: "This test is closed." };
  if (test.requestedAt) return { error: "The request time is already recorded." };
  const parsed = parseRequestedAt(optionalText(formData.get("requestedAtLocal")), optionalText(formData.get("tzOffset")), test);
  if (!parsed.ok) return { error: parsed.error };
  const evidenceUrl = optionalUrl(formData.get("requestedEvidenceUrl"));
  if (evidenceUrl && evidenceUrl.length > 500) return { error: "That screenshot link is too long (500 characters at most)." };
  await db
    .update(tests)
    .set({ requestedAt: parsed.value, requestedEvidenceUrl: evidenceUrl })
    .where(and(eq(tests.id, testId), isNull(tests.requestedAt)));
  refresh();
  return null;
}
