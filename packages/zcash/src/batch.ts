// Key batches: the public half of an offline key-generation run (keygen/).
// The public file holds viewing keys and addresses only; seeds live in a
// separate encrypted file that never leaves the offline machine.
import { Typecode, type Receiver } from "./ua";
import { assertNetworkUfvk, receiversOf, testAddresses } from "./addresses";
import { isNetworkId, type NetworkId } from "./networks";

export const BATCH_FORMAT = "zecproof-key-batch/1";

export interface BatchKey {
  index: number;
  ufvk: string;
  /** Account-level transparent xpub; lets the importer re-derive the t-address. */
  xpub: string;
  ironwoodUa: string;
  fullUa: string;
  transparentAddress: string;
}

export interface BatchVerification {
  index: number;
  /** Addresses the wallet showed after restoring that seed. */
  addresses: string[];
  /** Receivers that matched, e.g. ["orchard", "p2pkh"]. */
  matched: string[];
  /** Receivers present in the wallet's address that we cannot derive here. */
  unchecked: string[];
  verifiedAt: string;
}

export interface BatchPublic {
  format: typeof BATCH_FORMAT;
  batchId: string;
  network: NetworkId;
  createdAt: string;
  /** No funds can predate this height: the reuse check scans from here. */
  birthdayHeight: number;
  derivation: string;
  keys: BatchKey[];
  verification?: BatchVerification;
}

/** Parses a batch file and re-derives every address from its keys. */
export function parseBatchPublic(json: unknown): BatchPublic {
  const b = json as BatchPublic;
  if (b?.format !== BATCH_FORMAT) throw new Error(`Not a ZecProof key batch (format ${String(b?.format)}).`);
  if (!isNetworkId(b.network)) throw new Error(`Unknown network "${String(b.network)}".`);
  if (!Number.isInteger(b.birthdayHeight) || b.birthdayHeight < 1) throw new Error("Batch has no valid birthdayHeight.");
  if (!Array.isArray(b.keys) || b.keys.length === 0) throw new Error("Batch has no keys.");
  const seen = new Set<string>();
  b.keys.forEach((k, i) => {
    if (k.index !== i) throw new Error(`Key ${i} has index ${k.index}.`);
    if (seen.has(k.ufvk)) throw new Error(`Key ${i} repeats an earlier viewing key.`);
    seen.add(k.ufvk);
    assertNetworkUfvk(k.ufvk, b.network);
    const derived = testAddresses(k.ufvk, k.xpub, b.network);
    for (const field of ["ironwoodUa", "fullUa", "transparentAddress"] as const) {
      if (derived[field] !== k[field]) throw new Error(`Key ${i}: ${field} does not derive from its viewing key.`);
    }
  });
  return b;
}

const RECEIVER_NAME: Record<number, string> = {
  [Typecode.P2PKH]: "p2pkh",
  [Typecode.P2SH]: "p2sh",
  [Typecode.Sapling]: "sapling",
  [Typecode.Orchard]: "orchard",
};

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Compares the addresses a wallet shows for a restored seed with the batch
 * entry. Orchard must match; P2PKH must match if present; Sapling cannot be
 * derived here, so it is reported as unchecked. Throws on any mismatch.
 */
export function compareWalletAddresses(
  batch: BatchPublic,
  index: number,
  walletAddresses: string[],
): Omit<BatchVerification, "verifiedAt"> {
  const key = batch.keys[index];
  if (!key) throw new Error(`Batch has no key ${index}.`);
  const ours = new Map<number, Uint8Array>();
  for (const r of [...receiversOf(key.ironwoodUa, batch.network), ...receiversOf(key.transparentAddress, batch.network)]) {
    ours.set(r.typecode, r.data);
  }
  const matched = new Set<string>();
  const unchecked = new Set<string>();
  for (const address of walletAddresses) {
    const receivers: Receiver[] = receiversOf(address.trim(), batch.network);
    for (const r of receivers) {
      const name = RECEIVER_NAME[r.typecode] ?? `typecode-${r.typecode}`;
      const expected = ours.get(r.typecode);
      if (!expected) {
        unchecked.add(name);
      } else if (same(expected, r.data)) {
        matched.add(name);
      } else {
        throw new Error(
          `MISMATCH: the wallet's ${name} receiver differs from batch key ${index}. Do not use this batch.`,
        );
      }
    }
  }
  if (!matched.has("orchard")) {
    throw new Error("No Orchard receiver was checked. Paste the wallet's unified address (u1…/utest1…).");
  }
  return { index, addresses: walletAddresses, matched: [...matched], unchecked: [...unchecked] };
}
