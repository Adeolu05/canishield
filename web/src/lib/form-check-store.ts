// Stores form-check evidence: the screenshot under web/public/evidence (a
// generated name, metadata already stripped by checkEvidence) and the community
// report. Shared by the /report/form-check action and the maintainer scripts in
// web/scripts, so every path goes through exactly the same checks. Takes the db
// as a parameter so it also runs outside Next.
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, arrayContains, eq, inArray } from "drizzle-orm";
import { reports, services, type AddressType, type Db } from "@zecproof/db";
import { FORM_CHECK_METHOD, type EvidenceFormat, type FormCheckInput } from "./form-check";

type Evidence = { bytes: Uint8Array; format: EvidenceFormat };

/** Writes a checked screenshot under public/evidence; returns its file name, URL and a cleanup. */
async function storeEvidenceFile(slug: string, type: AddressType, day: Date, evidence: Evidence, webRoot: string) {
  // A name we choose, never the uploaded file name.
  const file = `${slug}-${type}-${day.toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}.${evidence.format === "png" ? "png" : "jpg"}`;
  const dir = join(webRoot, "public", "evidence");
  await mkdir(dir, { recursive: true });
  const path = join(dir, file);
  await writeFile(path, evidence.bytes, { flag: "wx" });
  return { file, url: `/api/evidence/${file}`, remove: () => unlink(path).catch(() => {}) }; // served by app/api/evidence
}

export async function saveFormCheck(
  db: Db,
  input: FormCheckInput,
  evidence: Evidence,
  webRoot = process.cwd(),
): Promise<{ ok: true; id: string; slug: string; file: string } | { ok: false; error: string }> {
  const [service] = await db
    .select({ id: services.id, slug: services.slug })
    .from(services)
    .where(and(eq(services.id, input.serviceId), arrayContains(services.networks, ["mainnet"])));
  if (!service) return { ok: false, error: "That service is not on the mainnet board." };

  const stored = await storeEvidenceFile(service.slug, input.addressType, input.observedAt, evidence, webRoot);
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
        evidenceUrl: stored.url,
      })
      .returning({ id: reports.id });
    return { ok: true, id: report.id, slug: service.slug, file: stored.file };
  } catch (e) {
    await stored.remove();
    throw e;
  }
}

/**
 * Attaches a checked screenshot to an existing community report, filling in
 * the error text and address only where they are empty. The self-hosted copy
 * replaces any earlier evidence link (returned so the caller can log it).
 * Never creates a report.
 */
export async function attachEvidence(
  db: Db,
  reportId: string,
  evidence: Evidence,
  fill: { errorText: string; address: string },
  webRoot = process.cwd(),
): Promise<{ ok: true; file: string; previousEvidenceUrl: string | null } | { ok: false; error: string }> {
  const [r] = await db
    .select({ report: reports, slug: services.slug })
    .from(reports)
    .innerJoin(services, eq(services.id, reports.serviceId))
    .where(eq(reports.id, reportId));
  if (!r) return { ok: false, error: `No report ${reportId}.` };
  const { report } = r;
  if (report.tier !== "community" || !report.addressType) return { ok: false, error: "Only community reports with an address type take evidence." };
  if (report.address && report.address !== fill.address) return { ok: false, error: "The report already names a different address." };
  if (report.evidenceUrl?.startsWith("/api/evidence/")) return { ok: false, error: "A screenshot is already attached." };

  const stored = await storeEvidenceFile(r.slug, report.addressType, report.observedAt ?? report.createdAt, evidence, webRoot);
  const previous = report.evidenceUrl;
  try {
    await db
      .update(reports)
      .set({ evidenceUrl: stored.url, errorText: report.errorText ?? fill.errorText, address: report.address ?? fill.address })
      .where(eq(reports.id, reportId));
    return { ok: true, file: stored.file, previousEvidenceUrl: previous };
  } catch (e) {
    await stored.remove();
    throw e;
  }
}

/** Marks community reports as reviewed (accepted), recording who reviewed them and when. */
export async function markReviewed(db: Db, ids: string[], reviewer: string, at = new Date()) {
  return db
    .update(reports)
    .set({ status: "accepted", reviewedBy: reviewer, reviewedAt: at })
    .where(and(inArray(reports.id, ids), eq(reports.tier, "community")))
    .returning({ id: reports.id });
}
