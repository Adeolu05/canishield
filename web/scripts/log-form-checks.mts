// One-off: log the Oct 5, 2026 withdrawal form checks (Bitget, MEXC, Binance)
// from screenshots on disk. Goes through the same code as /report/form-check:
// parseFormCheck (fields), checkEvidence (PNG/JPEG bytes, size, metadata
// stripped) and saveFormCheck (generated name under public/evidence, community
// report). Dry run by default; --apply stores. Skips checks already logged.
//
//   cd web && npx tsx --env-file=../.env scripts/log-form-checks.mts [--apply]
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, desc, eq, sql } from "drizzle-orm";
import { createDb, reports, services, tests, type AddressType } from "@zecproof/db";
import { FORM_CHECK_METHOD, checkEvidence, parseFormCheck } from "../src/lib/form-check";
import { saveFormCheck } from "../src/lib/form-check-store";

const SOURCE_DIR = "C:\\Users\\USER\\Downloads\\zecproof_exchanges_test";
const OBSERVED = "2026-10-05";

// The reference addresses: newest mainnet Trust Wallet test of each type (checked against the DB below).
const REFERENCE: Record<AddressType, string> = {
  ironwood_ua: "u1a5qtpxl7fl6cz6nrmcpnhpa2kgmxyreat94j7a0vsmxyf3gguflq48rkfm5e88ydcqcj9vr32jp2094p40qgm6hrps69g7t37ywdm0fj",
  full_ua:
    "u1htzfjg489ed68p2zwr9m282q5psrm2lnscy9suw94gx9lekhq6jg72qd2w454mnvfk0a486g6p80r6k7jch99wcsac6thl84vzvlyduh36rkc309mxn7zr372yg3f6kkl6yxc3e2ttm",
  transparent: "t1UNFPmPYCyK9eNECvB51njwbjo3s3f8yzP",
};

const FILE_PART: Record<AddressType, string> = { ironwood_ua: "ironwood", full_ua: "fullua", transparent: "t" };

interface Check {
  slug: string;
  type: AddressType;
  result: "form_accepted" | "address_rejected";
  errorText?: string;
  note?: string;
}

const BINANCE_ERROR =
  "The withdrawal address format is wrong. Please check the withdrawal address length and character content and try again";

const CHECKS: Check[] = [
  { slug: "bitget", type: "ironwood_ua", result: "address_rejected", errorText: "Enter a valid address" },
  { slug: "bitget", type: "full_ua", result: "address_rejected", errorText: "Enter a valid address" },
  { slug: "bitget", type: "transparent", result: "form_accepted", note: "ZEC withdrawals available in the Bitget app on Oct 5." },
  { slug: "mexc", type: "ironwood_ua", result: "address_rejected", errorText: "Withdrawal address does not conform to the rules" },
  { slug: "mexc", type: "full_ua", result: "address_rejected", errorText: "Withdrawal address does not conform to the rules" },
  { slug: "mexc", type: "transparent", result: "form_accepted" },
  { slug: "binance", type: "ironwood_ua", result: "address_rejected", errorText: BINANCE_ERROR, note: "Binance web, logged in." },
  { slug: "binance", type: "full_ua", result: "address_rejected", errorText: BINANCE_ERROR, note: "Binance web, logged in." },
  { slug: "binance", type: "transparent", result: "form_accepted", note: "Binance web, logged in." },
];

async function screenshot(slug: string, type: AddressType) {
  for (const ext of ["png", "jpg"]) {
    const path = join(SOURCE_DIR, slug, `${slug}-${FILE_PART[type]}.${ext}`);
    try {
      return { path, bytes: new Uint8Array(await readFile(path)) };
    } catch {}
  }
  throw new Error(`No screenshot for ${slug} ${type} in ${SOURCE_DIR}\\${slug}`);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const db = createDb();
  try {
    // The reference addresses must still be the Trust Wallet test addresses.
    for (const type of Object.keys(REFERENCE) as AddressType[]) {
      const [t] = await db
        .select({ address: tests.receiveAddress })
        .from(tests)
        .innerJoin(services, eq(services.id, tests.serviceId))
        .where(and(eq(services.slug, "trust-wallet"), eq(tests.network, "mainnet"), eq(tests.addressType, type)))
        .orderBy(desc(tests.createdAt))
        .limit(1);
      if (t?.address !== REFERENCE[type]) throw new Error(`Reference ${type} does not match the Trust Wallet test address.`);
    }

    const today = new Date(`${OBSERVED}T23:00:00Z`);
    let stored = 0;
    for (const c of CHECKS) {
      const [svc] = await db.select({ id: services.id }).from(services).where(eq(services.slug, c.slug));
      if (!svc) throw new Error(`Unknown service ${c.slug}`);
      const fields: Record<string, string | undefined> = {
        serviceId: svc.id,
        addressType: c.type,
        address: REFERENCE[c.type],
        result: c.result,
        errorText: c.errorText,
        observedAt: OBSERVED,
        note: c.note,
      };
      const parsed = parseFormCheck((name) => fields[name] ?? null, today);
      if (!parsed.ok) throw new Error(`${c.slug} ${c.type}: ${parsed.errors.join(" ")}`);
      const shot = await screenshot(c.slug, c.type);
      const evidence = checkEvidence(shot.bytes);
      if (!evidence.ok) throw new Error(`${c.slug} ${c.type}: ${evidence.error}`);

      const [dupe] = await db
        .select({ id: reports.id })
        .from(reports)
        .where(
          and(
            eq(reports.serviceId, svc.id),
            eq(reports.method, FORM_CHECK_METHOD),
            eq(reports.addressType, c.type),
            sql`${reports.observedAt}::date = ${OBSERVED}::date`,
          ),
        );
      const what = `${c.slug.padEnd(8)} ${c.type.padEnd(12)} ${c.result.padEnd(17)} ${shot.bytes.length} B -> ${evidence.bytes.length} B (${evidence.format})`;
      if (dupe) {
        console.log(`  skip   ${what}: already logged as ${dupe.id}`);
        continue;
      }
      if (!apply) {
        console.log(`  ok     ${what}`);
        continue;
      }
      const saved = await saveFormCheck(db, parsed.value, evidence);
      if (!saved.ok) throw new Error(`${c.slug} ${c.type}: ${saved.error}`);
      stored++;
      console.log(`  saved  ${what} as report ${saved.id}, public/evidence/${saved.file}`);
    }
    console.log(apply ? `\n${stored} form check(s) stored.` : "\nDry run: nothing stored. Re-run with --apply.");
  } finally {
    await db.$client.end();
  }
}

await main();
