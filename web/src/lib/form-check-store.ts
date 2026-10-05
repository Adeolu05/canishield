// Stores a validated form check: the screenshot under web/public/evidence (a
// generated name, metadata already stripped by checkEvidence) and a community
// report. Shared by the /report/form-check action and scripts/log-form-checks.ts
// so both go through exactly the same checks. Takes the db as a parameter so it
// also runs outside Next.
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, arrayContains, eq } from "drizzle-orm";
import { reports, services, type Db } from "@zecproof/db";
import { FORM_CHECK_METHOD, type EvidenceFormat, type FormCheckInput } from "./form-check";

export async function saveFormCheck(
  db: Db,
  input: FormCheckInput,
  evidence: { bytes: Uint8Array; format: EvidenceFormat },
  webRoot = process.cwd(),
): Promise<{ ok: true; id: string; slug: string; file: string } | { ok: false; error: string }> {
  const [service] = await db
    .select({ id: services.id, slug: services.slug })
    .from(services)
    .where(and(eq(services.id, input.serviceId), arrayContains(services.networks, ["mainnet"])));
  if (!service) return { ok: false, error: "That service is not on the mainnet board." };

  // Saved under web/public/evidence with a name we choose (never the uploaded file name).
  const day = input.observedAt.toISOString().slice(0, 10);
  const file = `${service.slug}-${input.addressType}-${day}-${randomUUID().slice(0, 8)}.${evidence.format === "png" ? "png" : "jpg"}`;
  const dir = join(webRoot, "public", "evidence");
  await mkdir(dir, { recursive: true });
  const path = join(dir, file);
  await writeFile(path, evidence.bytes, { flag: "wx" });

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
        evidenceUrl: `/api/evidence/${file}`, // served at request time; see app/api/evidence
      })
      .returning({ id: reports.id });
    return { ok: true, id: report.id, slug: service.slug, file };
  } catch (e) {
    await unlink(path).catch(() => {});
    throw e;
  }
}
