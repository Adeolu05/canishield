"use server";

// Deposit checks: the tester's side (docs/SPEC-deposits-and-timing.md, section 5).
// Every action after the first needs the cookie set when the check was created:
// the check page can be shared, the amount and the actions can't.
import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { and, arrayContains, eq } from "drizzle-orm";
import { depositChecks, services } from "@zecproof/db";
import { DepositAddressError, checkAmountZat, decodeDepositAddress } from "@zecproof/zcash/deposit";
import { isNetworkId } from "@zecproof/zcash/networks";
import { getDb } from "@/lib/db";
import { basePath } from "@/lib/network";
import { canReportNotCredited, parseCreditedAt, parseTxid, parseZec } from "@/lib/deposit-core";
import { depositsEnabled, hmacValue } from "@/lib/deposit-checks";
import { isTester, newTesterToken, setTesterCookie } from "@/lib/tester-token";

export type DepositFormState = { error: string } | null;

/** A link the maintainer can open; https only, capped. */
function screenshotUrl(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || s.length > 500) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** No txid for 48 hours: the check expires (the worker does it). */
const TX_WINDOW_MS = 48 * 3600_000;

export async function createDepositCheck(_prev: DepositFormState, formData: FormData): Promise<DepositFormState> {
  const network = formData.get("network");
  if (!isNetworkId(network) || !depositsEnabled(network)) return { error: "Deposit checks aren't open on this network yet." };
  const serviceId = formData.get("serviceId");
  if (typeof serviceId !== "string" || !serviceId) return { error: "Pick the service you're depositing into." };
  const wallet = String(formData.get("wallet") ?? "").trim();
  if (!wallet || wallet.length > 80) return { error: "Say which wallet you'll send from, with its version (80 characters at most)." };
  const baseZat = parseZec(String(formData.get("base") ?? ""));
  if (!baseZat) return { error: "Enter the amount you'll deposit, e.g. 0.01 (at or above the service's minimum deposit)." };
  if (baseZat > 10 * 100_000_000) return { error: "Keep a deposit check small: 10 at most." };

  let decoded;
  try {
    decoded = decodeDepositAddress(String(formData.get("address") ?? ""), network);
  } catch (e) {
    return { error: e instanceof DepositAddressError ? e.message : "That address couldn't be read." };
  }

  const db = getDb();
  const [service] = await db
    .select({ id: services.id })
    .from(services)
    .where(and(eq(services.id, serviceId), arrayContains(services.networks, [network])));
  if (!service) return { error: `That service is not listed on ${network}.` };

  // The address itself is never stored: only its keyed hash, as it will appear on-chain.
  const addressHmac = hmacValue(decoded.onChain ?? String(formData.get("address")).trim().toLowerCase());
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
  await setTesterCookie(check.id, token, path);
  redirect(path);
}

type Own = { ok: true; check: typeof depositChecks.$inferSelect } | { ok: false; error: string };

async function ownCheck(id: string): Promise<Own> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Check not found." };
  const [check] = await getDb().select().from(depositChecks).where(eq(depositChecks.id, id));
  if (!check) return { ok: false, error: "Check not found." };
  if (!(await isTester(check.id, check.testerTokenHash))) return { ok: false, error: "Only the browser that started this check can update it." };
  return { ok: true, check };
}

export async function submitDepositTxid(id: string, _prev: DepositFormState, formData: FormData): Promise<DepositFormState> {
  const own = await ownCheck(id);
  if (!own.ok) return { error: own.error };
  if (own.check.status !== "awaiting_tx") return { error: "This check already has its transaction." };
  const txid = parseTxid(String(formData.get("txid") ?? ""));
  if (!txid) return { error: "Paste the transaction ID: 64 characters, 0 to 9 and a to f." };
  const txidHmac = hmacValue(txid);
  const db = getDb();
  const [used] = await db.select({ id: depositChecks.id }).from(depositChecks).where(eq(depositChecks.txidHmac, txidHmac));
  if (used) return { error: "That transaction was already used for a check." };
  try {
    await db
      .update(depositChecks)
      .set({ status: "verifying", txid, txidHmac })
      .where(and(eq(depositChecks.id, id), eq(depositChecks.status, "awaiting_tx")));
  } catch {
    return { error: "That transaction was already used for a check." }; // lost a race on the unique hash
  }
  refresh();
  return null;
}

export async function markWalletRefused(id: string) {
  const own = await ownCheck(id);
  if (!own.ok || own.check.status !== "awaiting_tx") return;
  await getDb()
    .update(depositChecks)
    .set({ status: "wallet_refused", result: "wallet_refused", checkAmountZat: null })
    .where(and(eq(depositChecks.id, id), eq(depositChecks.status, "awaiting_tx")));
  refresh();
}

export async function reportDepositResult(id: string, _prev: DepositFormState, formData: FormData): Promise<DepositFormState> {
  const own = await ownCheck(id);
  if (!own.ok) return { error: own.error };
  const { check } = own;
  if (check.status !== "onchain_ok") return { error: "This check isn't waiting for a credit report." };
  const result = formData.get("result");
  if (result !== "credited" && result !== "not_credited_24h" && result !== "held_for_review") return { error: "Choose what happened to the deposit." };
  const evidenceUrl = screenshotUrl(formData.get("evidenceUrl"));
  if (!evidenceUrl) return { error: "Add a link to a screenshot of the service's deposit history (https, account details cropped out)." };
  let creditedAt: Date | null = null;
  if (result === "credited") {
    const parsed = parseCreditedAt(String(formData.get("creditedAtLocal") ?? ""), String(formData.get("tzOffset") ?? ""), check.blockTime);
    if (!parsed.ok) return { error: parsed.error };
    creditedAt = parsed.value;
  }
  if (result === "not_credited_24h" && !canReportNotCredited(check.blockTime)) {
    return { error: "Wait until 24 hours after the payment landed to report it as not credited." };
  }
  const shownRaw = String(formData.get("confirmationsShown") ?? "").trim();
  const confirmationsShown = shownRaw ? Number(shownRaw) : null;
  if (confirmationsShown != null && !(Number.isInteger(confirmationsShown) && confirmationsShown >= 0 && confirmationsShown <= 10_000)) {
    return { error: "Confirmations should be a whole number, or leave it empty." };
  }
  await getDb()
    .update(depositChecks)
    .set({ status: "reported", result, creditedAt, confirmationsShown, evidenceUrl })
    .where(and(eq(depositChecks.id, id), eq(depositChecks.status, "onchain_ok")));
  refresh();
  return null;
}
