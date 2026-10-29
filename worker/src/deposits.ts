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

/**
 * Where the deposit's money came from. `prev` holds the transactions that
 * created this tx's transparent inputs; any missing one is asked for ("need").
 */
export function classifyDepositSource(tx: ZbTx, prev: Map<string, ZbTx>): SourceResult {
  const direct = shieldedSpend(tx);
  if (direct) return { kind: "shielded", source: direct };
  if (tx.isCoinbase || tx.inputs.length === 0) return { kind: "refused", reason: "This transaction didn't spend from a shielded pool." };
  const missing = [...new Set(tx.inputs.map((i) => i.prev_txid))].filter((id) => !prev.has(id));
  if (missing.length) return { kind: "need", txids: missing };
  // Two-step (TEX): every transparent input must come straight out of a shielded pool, all the same one.
  const pools = new Set(tx.inputs.map((i) => shieldedSpend(prev.get(i.prev_txid)!)));
  if (pools.has(null) || pools.size !== 1) {
    return { kind: "refused", reason: "This deposit came from a transparent address, not a shielded wallet." };
  }
  const pool = [...pools][0]!;
  return { kind: "shielded", source: `via_tex_${pool}` as DepositSource };
}

/** True if some output pays exactly `amountZat` to an address whose keyed hash is `addressHmac`. */
export function paysCheckAddress(tx: ZbTx, amountZat: number, addressHmac: string, hmac: (value: string) => string): boolean {
  return tx.outputs.some((o) => o.address != null && BigInt(o.value) === BigInt(amountZat) && hmac(o.address) === addressHmac);
}

export interface DepositToVerify {
  addressType: DepositAddressType;
  addressHmac: string;
  checkAmountZat: number;
}

export type DepositVerdict =
  | { kind: "wait"; reason: string }
  | { kind: "need"; txids: string[] }
  | { kind: "ok"; source: DepositSource; height: number; blockTime: Date | null; destinationVisible: boolean }
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
  if (!tx.isCanonical) return { kind: "refused", reason: "This transaction isn't on the main chain." };
  if (tx.confirmations < requiredConfirmations) return { kind: "wait", reason: `${tx.confirmations}/${requiredConfirmations} confirmations` };

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
  const source = classifyDepositSource(tx, prev);
  if (source.kind === "need") return source;
  if (source.kind === "refused") return source;
  const t = Number(tx.blockTime);
  return { kind: "ok", source: source.source, height, blockTime: t > 0 ? new Date(t * 1000) : null, destinationVisible };
}
