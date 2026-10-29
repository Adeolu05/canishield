// Deposit checks: pure helpers shared by the server actions, pages and tests.
// docs/SPEC-deposits-and-timing.md, sections 5 to 7.
import type { DepositAddressType, DepositResult, DepositSource, DepositStatus } from "@zecproof/db";
import type { NetworkId } from "@zecproof/zcash/networks";

/** Who deposit checks are for: services that take deposits (not wallets, hardware wallets or faucets). */
export const DEPOSIT_SERVICE_KINDS = ["exchange", "swap", "other"] as const;

/** Deposit checks per network: ZECPROOF_ENABLE_DEPOSIT_CHECKS=testnet, mainnet,testnet or yes (both). */
export function depositsEnabledFor(setting: string | undefined, network: NetworkId): boolean {
  const v = (setting ?? "").toLowerCase().split(",").map((s) => s.trim());
  return v.includes("yes") || v.includes(network);
}

const ZAT = 100_000_000;

/** "0.01" → 1,000,000 zatoshis. Whole and fractional parts, at most 8 decimals; null if not a positive amount. */
export function parseZec(input: string | null | undefined): number | null {
  const m = /^\s*(\d{1,8})(?:[.,](\d{1,8}))?\s*$/.exec(input ?? "");
  if (!m) return null;
  const zat = Number(m[1]) * ZAT + Number((m[2] ?? "").padEnd(8, "0"));
  return zat > 0 && Number.isSafeInteger(zat) ? zat : null;
}

/** 1004217 → "0.01004217" (always 8 decimals: the tester must send exactly this). */
export const zecExact = (zat: number) => `${Math.floor(zat / ZAT)}.${String(zat % ZAT).padStart(8, "0")}`;

/** A 64-hex txid, lower-cased; null otherwise. */
export function parseTxid(input: string | null | undefined): string | null {
  const s = (input ?? "").trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(s) ? s : null;
}

export const DEPOSIT_ADDRESS_LABEL: Record<DepositAddressType, string> = {
  transparent_p2pkh: "Transparent",
  transparent_p2sh: "Transparent (P2SH)",
  tex: "TEX (transparent-only)",
  unified: "Unified",
  sapling: "Sapling",
};

export const DEPOSIT_SOURCE_LABEL: Record<DepositSource, string> = {
  ironwood: "From Ironwood",
  orchard: "From Orchard",
  sapling: "From Sapling",
  via_tex_ironwood: "From Ironwood, in two steps (TEX)",
  via_tex_orchard: "From Orchard, in two steps (TEX)",
  via_tex_sapling: "From Sapling, in two steps (TEX)",
};

export const DEPOSIT_RESULT_LABEL: Record<DepositResult, string> = {
  credited: "Credited",
  not_credited_24h: "Not credited after 24 hours",
  held_for_review: "Held for review",
  wallet_refused: "Wallet couldn't pay this address",
};

export const DEPOSIT_STATUS_LABEL: Record<DepositStatus, string> = {
  awaiting_tx: "Send the deposit",
  verifying: "Checking the payment on-chain",
  onchain_ok: "Payment verified: was it credited?",
  reported: "Thanks: waiting for review",
  published: "Published",
  refused: "The on-chain check didn't pass",
  expired: "Expired",
  wallet_refused: "Your wallet couldn't pay this address",
};

/** Step in the deposit flow: 0 Choose · 1 Send · 2 On-chain · 3 Credited. */
export const DEPOSIT_STEP: Record<DepositStatus, number> = {
  awaiting_tx: 1,
  verifying: 2,
  onchain_ok: 3,
  reported: 3,
  published: 3,
  refused: 2,
  expired: 1,
  wallet_refused: 1,
};

/** Clock skew allowed between block header times and the tester's clock. */
const SKEW_MS = 5 * 60_000;

export type CreditedAtResult = { ok: true; value: Date } | { ok: false; error: string };

/**
 * The tester's "credited at" time: a datetime-local value plus the browser's
 * getTimezoneOffset() (minutes to add to local time to get UTC). Must be after
 * the payment landed and not in the future.
 */
export function parseCreditedAt(local: string | null, tzOffsetMinutes: string | null, blockTime: Date | null, now = new Date()): CreditedAtResult {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local ?? "");
  if (!m) return { ok: false, error: "Enter the date and time the deposit was credited." };
  const offset = Number(tzOffsetMinutes);
  if (tzOffsetMinutes == null || tzOffsetMinutes === "" || !Number.isInteger(offset) || Math.abs(offset) > 14 * 60) {
    return { ok: false, error: "Your browser didn't send its timezone. Reload the page and try again." };
  }
  const [, y, mo, d, h, mi] = m.map(Number);
  const asLocal = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (asLocal.getUTCFullYear() !== y || asLocal.getUTCMonth() !== mo - 1 || asLocal.getUTCDate() !== d || asLocal.getUTCHours() !== h || asLocal.getUTCMinutes() !== mi) {
    return { ok: false, error: "That date and time isn't valid." };
  }
  const value = new Date(asLocal.getTime() + offset * 60_000);
  if (value.getTime() > now.getTime() + SKEW_MS) return { ok: false, error: "That time is in the future." };
  if (blockTime && value.getTime() < blockTime.getTime() - SKEW_MS) {
    return { ok: false, error: "That's before the payment landed on-chain. Check the date and time." };
  }
  return { ok: true, value };
}

/**
 * Durations shown or exported for deposits, deliberately coarse so they can't
 * be used to find the block (spec section 7): under 3 min, then 5-minute steps
 * up to an hour, 15-minute steps up to a day, then hours.
 */
export function roundedMinutes(ms: number): number {
  const min = Math.max(0, ms) / 60_000;
  if (min < 3) return 0;
  if (min < 60) return Math.max(5, Math.round(min / 5) * 5);
  if (min < 24 * 60) return Math.round(min / 15) * 15;
  return Math.round(min / 60) * 60;
}

export function roundedDuration(ms: number): string {
  const m = roundedMinutes(ms);
  if (m === 0) return "under 3 min";
  if (m < 60) return `about ${m} min`;
  const h = Math.floor(m / 60);
  const rest = m - h * 60;
  if (h < 48) return `about ${h} h${rest ? ` ${rest} min` : ""}`;
  return `about ${Math.round(h / 24)} d`;
}

/** Printable text only: letters, digits, punctuation, symbols and plain spaces (no control or bidi characters). */
export const isPlainText = (s: string) => /^[\p{L}\p{M}\p{N}\p{P}\p{S} ]+$/u.test(s);

/** "Not credited after 24 hours" can only be reported 24 hours after the payment landed. */
export const canReportNotCredited = (blockTime: Date | null, now = new Date()) => !!blockTime && now.getTime() - blockTime.getTime() >= 24 * 3600_000;
