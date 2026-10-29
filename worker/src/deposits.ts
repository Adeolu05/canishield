// Deposit checks: the on-chain half (docs/SPEC-deposits-and-timing.md, section 5).
//
// The tester sent a unique amount from their own shielded wallet to their own
// deposit address and gave us the txid. From ZecBlock we check, without ever
// learning the address in plain text:
//   1. the tx is on the main chain with enough confirmations,
//   2. it pays the check amount exactly to an output whose address matches the
//      keyed hash of the deposit address they gave (skipped when the payment
//      stays shielded: a unified or Sapling deposit address),
//   3. the money came from a shielded pool: directly (positive value balance),
//      or one hop back through a transparent address (the two-step TEX payment).
import type { NetworkId } from "@zecproof/zcash/networks";
import type { DepositAddressType, DepositSource } from "@zecproof/db";
import type { Fetch } from "./explorer";

export interface ZbInput {
  address: string | null;
  prev_txid: string;
  prev_vout: number;
  value: string;
}
export interface ZbOutput {
  address: string | null;
  value: string;
  vout_index: number;
}
/** The fields of ZecBlock's /api/tx/{txid} the deposit check reads. */
export interface ZbTx {
  txid: string;
  blockHeight: string | number | null;
  blockTime: string | number | null;
  confirmations: number;
  isCanonical: boolean;
  isCoinbase?: boolean;
  valueBalanceSaplingZat: string;
  valueBalanceOrchardZat: string;
  valueBalanceIronwoodZat: string;
  inputs: ZbInput[];
  outputs: ZbOutput[];
}

const ZECBLOCK_API: Record<NetworkId, string> = {
  mainnet: "https://api.zecblock.com",
  testnet: "https://api.testnet.zecblock.com",
};

/** ZecBlock has returned inputs/outputs both as arrays and as JSON strings; accept either. */
export function normalizeTx(raw: unknown): ZbTx | null {
  const t = raw as Record<string, unknown> | null;
  if (!t || typeof t.txid !== "string") return null;
  const list = (v: unknown) => (typeof v === "string" ? (JSON.parse(v) as unknown[]) : Array.isArray(v) ? v : []);
  return {
    txid: t.txid,
    blockHeight: (t.blockHeight as string | number | null) ?? null,
    blockTime: (t.blockTime as string | number | null) ?? null,
    confirmations: Number(t.confirmations ?? 0),
    isCanonical: t.isCanonical === true,
    isCoinbase: t.isCoinbase === true,
    valueBalanceSaplingZat: String(t.valueBalanceSaplingZat ?? "0"),
    valueBalanceOrchardZat: String(t.valueBalanceOrchardZat ?? "0"),
    valueBalanceIronwoodZat: String(t.valueBalanceIronwoodZat ?? "0"),
    inputs: list(t.inputs) as ZbInput[],
    outputs: list(t.outputs) as ZbOutput[],
  };
}

export type TxLookup = { kind: "found"; tx: ZbTx } | { kind: "missing" } | { kind: "unavailable"; reason: string };

export async function fetchTx(network: NetworkId, txid: string, fetchFn: Fetch = fetch): Promise<TxLookup> {
  try {
    const res = await fetchFn(`${ZECBLOCK_API[network]}/api/tx/${txid}`, { signal: AbortSignal.timeout(10_000) });
    if (res.status === 404) return { kind: "missing" };
    if (res.status !== 200) return { kind: "unavailable", reason: `ZecBlock HTTP ${res.status}` };
    const tx = normalizeTx(await res.json());
    return tx ? { kind: "found", tx } : { kind: "missing" };
  } catch (err) {
    return { kind: "unavailable", reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Which shielded pool value left, if any (positive value balance = value leaving that pool). */
export function shieldedSpend(tx: ZbTx): "ironwood" | "orchard" | "sapling" | null {
  // BigInt: zatoshi strings can exceed 2^53 on large transactions.
  const pos = (v: string) => {
    try {
      return BigInt(v) > 0n;
    } catch {
      return false;
    }
  };
  if (pos(tx.valueBalanceIronwoodZat)) return "ironwood";
  if (pos(tx.valueBalanceOrchardZat)) return "orchard";
  if (pos(tx.valueBalanceSaplingZat)) return "sapling";
  return null;
}

export type SourceResult = { kind: "shielded"; source: DepositSource } | { kind: "refused"; reason: string } | { kind: "need"; txids: string[] };

export interface SourceRules {
  /** Follow transparent inputs one hop back (only for TEX deposit addresses, which can't be paid any other way). */
  allowOneHop: boolean;
  /** The first step of a two-step payment can't be older than the check. */
  notBefore: Date;
}

/** Blocks between the two steps of a TEX payment: wallets send the second step straight after the first. */
const MAX_HOP_BLOCKS = 100;

const txTime = (tx: ZbTx) => {
  const t = Number(tx.blockTime);
  return t > 0 ? new Date(t * 1000) : null;
};

/**
 * Where the deposit's money came from. A direct payment spends only shielded
 * value (no transparent inputs). A two-step (TEX) payment spends only outputs of
 * transactions that themselves spent only shielded value, made for this check
 * and just before it. `prev` holds those transactions; missing ones are asked for.
 */
export function classifyDepositSource(tx: ZbTx, prev: Map<string, ZbTx>, rules: SourceRules): SourceResult {
  if (tx.isCoinbase) return { kind: "refused", reason: "This transaction didn't spend from a shielded pool." };
  const direct = shieldedSpend(tx);
  if (direct) {
    if (tx.inputs.length > 0) return { kind: "refused", reason: "This deposit mixed transparent and shielded money. Send it from your shielded balance only." };
    return { kind: "shielded", source: direct };
  }
  if (!rules.allowOneHop || tx.inputs.length === 0) {
    return { kind: "refused", reason: "This deposit came from a transparent address, not a shielded wallet." };
  }
  const missing = [...new Set(tx.inputs.map((i) => i.prev_txid))].filter((id) => !prev.has(id));
  if (missing.length) return { kind: "need", txids: missing };
  const height = Number(tx.blockHeight);
  const pools = new Set<string | null>();
  for (const input of tx.inputs) {
    const p = prev.get(input.prev_txid)!;
    const pool = shieldedSpend(p);
    const pt = txTime(p);
    const ph = Number(p.blockHeight);
    const ok =
      pool !== null &&
      p.inputs.length === 0 && // the first step spent shielded value only
      pt !== null &&
      pt.getTime() >= rules.notBefore.getTime() &&
      ph > 0 &&
      ph <= height &&
      height - ph <= MAX_HOP_BLOCKS;
    pools.add(ok ? pool : null);
  }
  if (pools.has(null) || pools.size !== 1) {
    return { kind: "refused", reason: "This deposit came from a transparent address, not straight from a shielded wallet in two steps." };
  }
  return { kind: "shielded", source: `via_tex_${[...pools][0]}` as DepositSource };
}

/** True if some output pays exactly `amountZat` to an address whose keyed hash is `addressHmac`. */
export function paysCheckAddress(tx: ZbTx, amountZat: number, addressHmac: string, hmac: (value: string) => string): boolean {
  return tx.outputs.some((o) => o.address != null && BigInt(o.value) === BigInt(amountZat) && hmac(o.address) === addressHmac);
}

export interface DepositToVerify {
  addressType: DepositAddressType;
  addressHmac: string;
  checkAmountZat: number;
  /** When the check (and so its unique amount) was created: the payment can't be older. */
  createdAt: Date;
}

/** Block header times can run a little behind real time. */
const CLOCK_SKEW_MS = 5 * 60_000;

export type DepositVerdict =
  | { kind: "wait"; reason: string }
  | { kind: "need"; txids: string[] }
  | { kind: "ok"; source: DepositSource; height: number; blockTime: Date; destinationVisible: boolean }
  | { kind: "refused"; reason: string };

/** The whole on-chain check for one deposit, given the tx and any input transactions already fetched. */
export function verifyDeposit(
  check: DepositToVerify,
  tx: ZbTx,
  prev: Map<string, ZbTx>,
  requiredConfirmations: number,
  hmac: (value: string) => string,
): DepositVerdict {
  const height = Number(tx.blockHeight);
  if (!(height > 0)) return { kind: "wait", reason: "not mined yet" };
  // Off the main chain can be a reorg in progress: wait (the step gives up after its deadline).
  if (!tx.isCanonical) return { kind: "wait", reason: "not on the main chain (yet)" };
  if (tx.confirmations < requiredConfirmations) return { kind: "wait", reason: `${tx.confirmations}/${requiredConfirmations} confirmations` };
  const notBefore = new Date(check.createdAt.getTime() - CLOCK_SKEW_MS);
  const landed = txTime(tx);
  if (!landed || landed < notBefore) return { kind: "refused", reason: "This transaction is older than the check. Send a new payment with the check amount." };

  // Unified and Sapling deposit addresses: a shielded payment to them stays shielded, so the destination and
  // amount can't be seen on-chain. Only the source is checked; the credit screenshot carries the rest.
  const destinationVisible = check.addressType !== "unified" && check.addressType !== "sapling";
  if (destinationVisible && !paysCheckAddress(tx, check.checkAmountZat, check.addressHmac, hmac)) {
    const amountSeen = tx.outputs.some((o) => BigInt(o.value) === BigInt(check.checkAmountZat));
    return {
      kind: "refused",
      reason: amountSeen
        ? "The check amount went to a different address than the deposit address you gave."
        : "No output in this transaction pays the exact check amount.",
    };
  }
  const source = classifyDepositSource(tx, prev, { allowOneHop: check.addressType === "tex", notBefore });
  if (source.kind === "need") return source;
  if (source.kind === "refused") return source;
  return { kind: "ok", source: source.source, height, blockTime: landed, destinationVisible };
}
