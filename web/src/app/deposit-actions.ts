"use server";

// Deposit checks: the tester's side (docs/SPEC-deposits-and-timing.md, section 5).
// Every action after the first needs the cookie set when the check was created:
// the check page can be shared, the amount and the actions can't.
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { and, arrayContains, count, eq, gt, inArray } from "drizzle-orm";
import { depositChecks, services } from "@zecproof/db";
import { DepositAddressError, checkAmountZat, decodeDepositAddress } from "@zecproof/zcash/deposit";
import { isNetworkId } from "@zecproof/zcash/networks";
import { getDb } from "@/lib/db";
import { basePath } from "@/lib/network";
import { DEPOSIT_SERVICE_KINDS, canReportNotCredited, isPlainText, parseCreditedAt, parseTxid, parseZec } from "@/lib/deposit-core";
import { depositsEnabled, hmacValue } from "@/lib/deposit-checks";
import { isTester, newTesterToken, setTesterCookie } from "@/lib/tester-token";

/** On an error, what the tester typed comes back, so the form can show it again (React resets forms after an action). */
export type DepositFormState = { error: string; values?: Record<string, string> } | null;

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();
const keep = (formData: FormData, names: string[]) => Object.fromEntries(names.map((n) => [n, text(formData, n)]));

/** A link the maintainer can open; https only, capped. */
function screenshotUrl(v: string): string | null {
  if (!v || v.length > 500) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** No txid within 48 hours: the check expires (the worker does it). */
const TX_WINDOW_MS = 48 * 3600_000;
/** The cookie must outlive the whole check: 48 h to send, 48 h to verify, 7 days to report, plus margin. */
const COOKIE_MAX_AGE_SECONDS = 12 * 86_400;
/** Open checks allowed for one deposit address at a time. */
const MAX_OPEN_PER_ADDRESS = 2;
/** New checks per network per hour, across everyone: deposit checks are a handful a day, not thousands. */
const MAX_NEW_PER_HOUR = 30;
const OPEN = ["awaiting_tx", "verifying", "onchain_ok"] as const;

export async function createDepositCheck(_prev: DepositFormState, formData: FormData): Promise<DepositFormState> {
  const values = keep(formData, ["serviceId", "address", "base", "wallet"]);
  const fail = (error: string): DepositFormState => ({ error, values });
  const network = formData.get("network");
  if (!isNetworkId(network) || !depositsEnabled(network)) return fail("Deposit checks aren't open on this network yet.");
  const serviceId = values.serviceId;
  if (!isUuid(serviceId)) return fail("Pick the service you're depositing into.");
  const wallet = values.wallet;
  if (!wallet || wallet.length > 80 || !isPlainText(wallet)) return fail("Say which wallet you'll send from, with its version (plain text, 80 characters at most).");
  const baseZat = parseZec(values.base);
  if (!baseZat) return fail("Enter the amount you'll deposit, e.g. 0.01 (at or above the service's minimum deposit).");
  if (baseZat > 10 * 100_000_000) return fail("Keep a deposit check small: 10 at most.");

  let decoded;
  try {
    decoded = decodeDepositAddress(values.address, network);
  } catch (e) {
    return fail(e instanceof DepositAddressError ? e.message : "That address couldn't be read.");
  }

  const db = getDb();
  const [service] = await db
    .select({ id: services.id, kind: services.kind })
    .from(services)
    .where(and(eq(services.id, serviceId), arrayContains(services.networks, [network])));
  if (!service) return fail(`That service is not listed on ${network}.`);
  if (!(DEPOSIT_SERVICE_KINDS as readonly string[]).includes(service.kind)) return fail("Deposit checks are for exchanges and swap services.");

  // The address itself is never stored: only its keyed hash, as it will appear on-chain.
  const addressHmac = hmacValue(decoded.onChain ?? values.address.toLowerCase());
  const [{ open }] = await db
    .select({ open: count() })
    .from(depositChecks)
    .where(and(eq(depositChecks.addressHmac, addressHmac), inArray(depositChecks.status, [...OPEN])));
  if (open >= MAX_OPEN_PER_ADDRESS) return fail("This deposit address already has checks in progress. Finish one of those first.");
  const [{ recent }] = await db
    .select({ recent: count() })
    .from(depositChecks)
    .where(and(eq(depositChecks.network, network), gt(depositChecks.createdAt, new Date(Date.now() - 3600_000))));
  if (recent >= MAX_NEW_PER_HOUR) return fail("A lot of checks were started in the last hour. Try again a little later.");

  const { token, hash } = newTesterToken();
  const [check] = await db
    .insert(depositChecks)
    .values({
      serviceId,
      network,
      addressType: decoded.kind,
      uaReceivers: decoded.receivers ?? null,
      addressHmac,
      checkAmountZat: checkAmountZat(baseZat),
      wallet,
      testerTokenHash: hash,
      expiresAt: new Date(Date.now() + TX_WINDOW_MS),
    })
    .returning({ id: depositChecks.id });
  const path = `${basePath(network)}/test/deposit/${check.id}`;
  await setTesterCookie(check.id, token, path, COOKIE_MAX_AGE_SECONDS);
  redirect(path);
}

type Own = { ok: true; check: typeof depositChecks.$inferSelect } | { ok: false; error: string };

async function ownCheck(id: string): Promise<Own> {
  if (!isUuid(id)) return { ok: false, error: "Check not found." };
  const [check] = await getDb().select().from(depositChecks).where(eq(depositChecks.id, id));
  if (!check) return { ok: false, error: "Check not found." };
  if (!(await isTester(check.id, check.testerTokenHash))) return { ok: false, error: "Only the browser that started this check can update it." };
  return { ok: true, check };
}

const MOVED_ON = "This check has moved on in the meantime. Reload the page.";

export async function submitDepositTxid(id: string, _prev: DepositFormState, formData: FormData): Promise<DepositFormState> {
  const values = keep(formData, ["txid"]);
  const own = await ownCheck(id);
  if (!own.ok) return { error: own.error, values };
  if (own.check.status !== "awaiting_tx") return { error: "This check already has its transaction.", values };
  const txid = parseTxid(values.txid);
  if (!txid) return { error: "Paste the transaction ID: 64 characters, 0 to 9 and a to f.", values };
  const txidHmac = hmacValue(txid);
  const db = getDb();
  const [used] = await db.select({ id: depositChecks.id }).from(depositChecks).where(eq(depositChecks.txidHmac, txidHmac));
  if (used) return { error: "That transaction was already used for a check.", values };
  let updated;
  try {
    updated = await db
      .update(depositChecks)
      .set({ status: "verifying", txid, txidHmac, txSubmittedAt: new Date() })
      .where(and(eq(depositChecks.id, id), eq(depositChecks.status, "awaiting_tx")))
      .returning({ id: depositChecks.id });
  } catch (e) {
    // 23505: unique violation on txid_hmac (lost a race with another check); anything else is ours.
    if ((e as { cause?: { code?: string }; code?: string }).cause?.code === "23505" || (e as { code?: string }).code === "23505") {
      return { error: "That transaction was already used for a check.", values };
    }
    throw e;
  }
  if (updated.length === 0) return { error: MOVED_ON, values };
  refresh();
  return null;
}

export async function markWalletRefused(id: string, _prev: DepositFormState, formData: FormData): Promise<DepositFormState> {
  const values = keep(formData, ["refusedEvidenceUrl"]);
  const own = await ownCheck(id);
  if (!own.ok) return { error: own.error, values };
  if (own.check.status !== "awaiting_tx") return { error: MOVED_ON, values };
  const evidenceUrl = screenshotUrl(values.refusedEvidenceUrl);
  if (!evidenceUrl) return { error: "Add a link to a screenshot of the wallet's error (https), so it can be reviewed.", values };
  const updated = await getDb()
    .update(depositChecks)
    .set({ status: "wallet_refused", result: "wallet_refused", checkAmountZat: null, evidenceUrl })
    .where(and(eq(depositChecks.id, id), eq(depositChecks.status, "awaiting_tx")))
    .returning({ id: depositChecks.id });
  if (updated.length === 0) return { error: MOVED_ON, values };
  refresh();
  return null;
}

export async function reportDepositResult(id: string, _prev: DepositFormState, formData: FormData): Promise<DepositFormState> {
  const values = keep(formData, ["result", "creditedAtLocal", "confirmationsShown", "evidenceUrl"]);
  const own = await ownCheck(id);
  if (!own.ok) return { error: own.error, values };
  const { check } = own;
  if (check.status !== "onchain_ok") return { error: "This check isn't waiting for a credit report.", values };
  const result = values.result;
  if (result !== "credited" && result !== "not_credited_24h" && result !== "held_for_review") return { error: "Choose what happened to the deposit.", values };
  const evidenceUrl = screenshotUrl(values.evidenceUrl);
  if (!evidenceUrl) return { error: "Add a link to a screenshot of the service's deposit history (https, account details cropped out).", values };
  let creditedAt: Date | null = null;
  if (result === "credited") {
    const parsed = parseCreditedAt(values.creditedAtLocal, text(formData, "tzOffset"), check.blockTime);
    if (!parsed.ok) return { error: parsed.error, values };
    creditedAt = parsed.value;
  }
  if (result === "not_credited_24h" && !canReportNotCredited(check.blockTime ?? check.updatedAt)) {
    return { error: "Wait until 24 hours after the payment landed to report it as not credited.", values };
  }
  const confirmationsShown = values.confirmationsShown ? Number(values.confirmationsShown) : null;
  if (confirmationsShown != null && !(Number.isInteger(confirmationsShown) && confirmationsShown >= 0 && confirmationsShown <= 10_000)) {
    return { error: "Confirmations should be a whole number, or leave it empty.", values };
  }
  const updated = await getDb()
    .update(depositChecks)
    .set({ status: "reported", result, creditedAt, confirmationsShown, evidenceUrl })
    .where(and(eq(depositChecks.id, id), eq(depositChecks.status, "onchain_ok")))
    .returning({ id: depositChecks.id });
  if (updated.length === 0) return { error: MOVED_ON, values };
  refresh();
  return null;
}
