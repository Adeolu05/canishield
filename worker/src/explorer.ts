// Independent confirmation of a receipt's txid and block, by explorers not run
// by the lightwalletd operator (zec.rocks).
//
//   ZecBlock   (zecblock.com; same API on testnet and mainnet): primary
//   Blockchair (mainnet only): fallback. Its fee/value fields are wrong for
//              v6 (Ironwood) transactions, so only txid and height are used.
//
// Any explorer that answers and DISAGREES (other block, not canonical) stops
// verification; we never shop for a second opinion that agrees. An explorer
// that is down or does not know the tx yet falls through to the next one.
import type { NetworkId } from "@zecproof/zcash/networks";

export interface ReceiptRef {
  txid: string;
  height: number;
  blockHash?: string | null;
}

export type ExplorerVerdict =
  | { kind: "confirmed"; explorer: string; confirmations: number }
  | { kind: "disagrees"; explorer: string; reason: string }
  | { kind: "unavailable"; explorer: string; reason: string };

export type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

const TIMEOUT_MS = 10_000;

const ZECBLOCK_API: Record<NetworkId, string> = {
  mainnet: "https://api.zecblock.com",
  testnet: "https://api.testnet.zecblock.com",
};

async function getJson(fetchFn: Fetch, url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = res.status === 404 ? null : await res.json().catch(() => null);
  return { status: res.status, body };
}

function judge(explorer: string, r: ReceiptRef, found: { height: number; hash?: string; canonical: boolean; confirmations: number }, required: number): ExplorerVerdict {
  if (!found.canonical) return { kind: "disagrees", explorer, reason: "transaction is not on the main chain" };
  if (found.height !== r.height) {
    return { kind: "disagrees", explorer, reason: `explorer has the tx at height ${found.height}, scanner saw ${r.height}` };
  }
  if (r.blockHash && found.hash && found.hash !== r.blockHash) {
    return { kind: "disagrees", explorer, reason: `block hash differs at height ${r.height}` };
  }
  if (found.confirmations < required) {
    return { kind: "unavailable", explorer, reason: `${found.confirmations}/${required} confirmations on ${explorer}` };
  }
  return { kind: "confirmed", explorer, confirmations: found.confirmations };
}

export async function checkZecBlock(fetchFn: Fetch, network: NetworkId, r: ReceiptRef, required: number): Promise<ExplorerVerdict> {
  const explorer = "ZecBlock";
  try {
    const { status, body } = await getJson(fetchFn, `${ZECBLOCK_API[network]}/api/tx/${r.txid}`);
    const tx = body as { txid?: string; blockHeight?: string | number; blockHash?: string; confirmations?: number; isCanonical?: boolean } | null;
    if (status === 404 || !tx?.txid) return { kind: "unavailable", explorer, reason: "transaction not found (yet)" };
    if (status !== 200) return { kind: "unavailable", explorer, reason: `HTTP ${status}` };
    if (tx.txid !== r.txid) return { kind: "disagrees", explorer, reason: "returned a different txid" };
    return judge(explorer, r, {
      height: Number(tx.blockHeight),
      hash: tx.blockHash,
      canonical: tx.isCanonical === true,
      confirmations: Number(tx.confirmations ?? 0),
    }, required);
  } catch (err) {
    return { kind: "unavailable", explorer, reason: err instanceof Error ? err.message : String(err) };
  }
}

export async function checkBlockchair(fetchFn: Fetch, r: ReceiptRef, required: number): Promise<ExplorerVerdict> {
  const explorer = "Blockchair";
  try {
    const { status, body } = await getJson(fetchFn, `https://api.blockchair.com/zcash/dashboards/transaction/${r.txid}`);
    const b = body as { data?: Record<string, { transaction?: { hash?: string; block_id?: number } }>; context?: { state?: number } } | null;
    const tx = b?.data?.[r.txid]?.transaction;
    if (status !== 200 || !tx?.hash) return { kind: "unavailable", explorer, reason: status === 200 ? "transaction not found (yet)" : `HTTP ${status}` };
    const height = Number(tx.block_id);
    const best = Number(b?.context?.state);
    if (!(height > 0)) return { kind: "unavailable", explorer, reason: "transaction not mined yet" };
    // Blockchair's transaction dashboard has no block hash or canonical flag;
    // a tx it reports in a block is on its best chain.
    return judge(explorer, r, { height, canonical: true, confirmations: best - height + 1 }, required);
  } catch (err) {
    return { kind: "unavailable", explorer, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Primary first; fallback only when the primary could not answer. */
export async function confirmOnExplorer(
  network: NetworkId,
  r: ReceiptRef,
  required: number,
  fetchFn: Fetch = fetch,
): Promise<ExplorerVerdict> {
  const primary = await checkZecBlock(fetchFn, network, r, required);
  if (primary.kind !== "unavailable" || network !== "mainnet") return primary;
  const fallback = await checkBlockchair(fetchFn, r, required);
  return fallback.kind === "unavailable"
    ? { kind: "unavailable", explorer: "ZecBlock, Blockchair", reason: `${primary.reason}; ${fallback.reason}` }
    : fallback;
}
