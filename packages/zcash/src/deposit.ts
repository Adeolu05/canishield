// Deposit addresses (docs/SPEC-deposits-and-timing.md, sections 5 and 7).
//
// A deposit check never stores the tester's deposit address. It stores what
// kind of address it was and a keyed hash (HMAC) of how the address appears
// on-chain, so the worker can recognise the payment without anyone being able
// to recover the address from the database.
import { bech32, bech32m, createBase58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import type { NetworkId } from "./networks";
import { decodeUnifiedAddress } from "./ua";

const base58check = createBase58check(sha256);

export type DepositAddressKind = "transparent_p2pkh" | "transparent_p2sh" | "tex" | "unified" | "sapling";
export type ReceiverKind = "p2pkh" | "p2sh" | "sapling" | "orchard" | "unknown";

export interface DecodedDepositAddress {
  kind: DepositAddressKind;
  /**
   * The address a transparent output paying it shows on-chain: the t-address
   * itself, or for TEX the P2PKH address with the same 20-byte hash. Null when
   * a shielded wallet's payment stays shielded (unified with a shielded
   * receiver, or Sapling): the destination is then not visible on-chain.
   */
  onChain: string | null;
  /** Unified addresses only: the receiver kinds, in the address's order. */
  receivers?: ReceiverKind[];
  /** Plain-words description for the tester. */
  label: string;
}

// Two-byte version prefixes (Zcash protocol spec, section 5.6.1.1).
const VERSIONS: Record<NetworkId, { p2pkh: [number, number]; p2sh: [number, number] }> = {
  mainnet: { p2pkh: [0x1c, 0xb8], p2sh: [0x1c, 0xbd] },
  testnet: { p2pkh: [0x1d, 0x25], p2sh: [0x1c, 0xba] },
};
// Bech32(m) human-readable parts per network (ZIP 316, ZIP 320, protocol spec 5.6.3.1).
const HRP: Record<NetworkId, { ua: string; tex: string; sapling: string }> = {
  mainnet: { ua: "u", tex: "tex", sapling: "zs" },
  testnet: { ua: "utest", tex: "textest", sapling: "ztestsapling" },
};
const OTHER: Record<NetworkId, NetworkId> = { mainnet: "testnet", testnet: "mainnet" };

export class DepositAddressError extends Error {}

const RECEIVER_KIND: Record<number, ReceiverKind> = { 0: "p2pkh", 1: "p2sh", 2: "sapling", 3: "orchard" };

function base58Kind(raw: Uint8Array, network: NetworkId): "transparent_p2pkh" | "transparent_p2sh" | null {
  if (raw.length !== 22) return null;
  const v = VERSIONS[network];
  if (raw[0] === v.p2pkh[0] && raw[1] === v.p2pkh[1]) return "transparent_p2pkh";
  if (raw[0] === v.p2sh[0] && raw[1] === v.p2sh[1]) return "transparent_p2sh";
  return null;
}

const encodeT = (version: [number, number], hash: Uint8Array) => base58check.encode(new Uint8Array([...version, ...hash]));

/**
 * Decodes a deposit address the tester pasted. Throws DepositAddressError with
 * a message fit to show them (wrong network, not an address, unsupported kind).
 */
export function decodeDepositAddress(input: string, network: NetworkId): DecodedDepositAddress {
  const address = input.trim();
  if (!address) throw new DepositAddressError("Paste the deposit address the service shows you.");
  const lower = address.toLowerCase();
  // Bech32 strings are all lower case or all upper case, never mixed (BIP 173).
  const mixedCase = address !== lower && address !== address.toUpperCase();
  const hrp = HRP[network];
  const wrongNetwork = () =>
    new DepositAddressError(`That's a ${OTHER[network]} address. This check is on ${network}: paste the ${network} deposit address.`);

  // Transparent: base58check, t1/t3 on mainnet, tm/t2 on testnet.
  if (/^t[1-9A-HJ-NP-Za-km-z]{34}$/.test(address)) {
    let raw: Uint8Array;
    try {
      raw = base58check.decode(address);
    } catch {
      throw new DepositAddressError("That transparent address has a typo: its checksum doesn't match.");
    }
    const kind = base58Kind(raw, network);
    if (!kind) {
      if (base58Kind(raw, OTHER[network])) throw wrongNetwork();
      throw new DepositAddressError("That isn't a Zcash transparent address.");
    }
    return {
      kind,
      onChain: address,
      label: kind === "transparent_p2pkh" ? "Transparent address (t-address)" : "Transparent script address (P2SH)",
    };
  }

  const bech = [hrp.tex, hrp.sapling, hrp.ua, HRP[OTHER[network]].tex, HRP[OTHER[network]].sapling, HRP[OTHER[network]].ua].some((h) => lower.startsWith(`${h}1`));
  if (bech && mixedCase) throw new DepositAddressError("That address mixes upper and lower case, so it has a typo. Copy it again from the service.");

  // TEX (ZIP 320): bech32m of a 20-byte P2PKH hash. Paid on-chain as that P2PKH address.
  if (lower.startsWith(`${hrp.tex}1`) || lower.startsWith(`${HRP[OTHER[network]].tex}1`)) {
    let decoded;
    try {
      decoded = bech32m.decode(lower as `${string}1${string}`, 90);
    } catch {
      throw new DepositAddressError("That TEX address has a typo: its checksum doesn't match.");
    }
    if (decoded.prefix !== hrp.tex) throw wrongNetwork();
    const hash = bech32m.fromWords(decoded.words);
    if (hash.length !== 20) throw new DepositAddressError("That TEX address is malformed.");
    return {
      kind: "tex",
      onChain: encodeT(VERSIONS[network].p2pkh, hash),
      label: "TEX address: transparent-only. A shielded wallet must support TEX (ZIP 320) to pay it, in two steps.",
    };
  }

  // Sapling: bech32 (not bech32m), 43-byte payload. A shielded payment stays shielded.
  if (lower.startsWith(`${hrp.sapling}1`) || lower.startsWith(`${HRP[OTHER[network]].sapling}1`)) {
    let decoded;
    try {
      decoded = bech32.decode(lower as `${string}1${string}`, 120);
    } catch {
      throw new DepositAddressError("That Sapling address has a typo: its checksum doesn't match.");
    }
    if (decoded.prefix !== hrp.sapling) throw wrongNetwork();
    if (bech32.fromWords(decoded.words).length !== 43) throw new DepositAddressError("That Sapling address is malformed.");
    return { kind: "sapling", onChain: null, label: "Sapling shielded address (zs…): a shielded deposit stays shielded." };
  }

  // Unified (ZIP 316).
  if (lower.startsWith(`${hrp.ua}1`) || lower.startsWith(`${HRP[OTHER[network]].ua}1`)) {
    let ua;
    try {
      ua = decodeUnifiedAddress(lower);
    } catch {
      throw new DepositAddressError("That unified address has a typo or is malformed.");
    }
    if (ua.hrp !== hrp.ua) throw wrongNetwork();
    const receivers = ua.receivers.map((r) => RECEIVER_KIND[r.typecode] ?? "unknown");
    const shielded = receivers.some((k) => k === "orchard" || k === "sapling");
    const t = ua.receivers.find((r) => r.typecode === 0 || r.typecode === 1);
    const onChain = shielded ? null : t ? encodeT(t.typecode === 0 ? VERSIONS[network].p2pkh : VERSIONS[network].p2sh, t.data) : null;
    const names = receivers.map((k) => ({ p2pkh: "transparent", p2sh: "transparent (P2SH)", sapling: "Sapling", orchard: "Orchard", unknown: "other" })[k]);
    return {
      kind: "unified",
      onChain,
      receivers,
      label: `Unified address with ${[...new Set(names)].join(" + ")} receivers${shielded ? ": a shielded deposit stays shielded." : "."}`,
    };
  }

  throw new DepositAddressError("That doesn't look like a Zcash address. Copy it again from the service's deposit page.");
}

/** HMAC-SHA256(secret, value) as hex. The secret lives only in the environment (ZECPROOF_DEPOSIT_SECRET). */
export function depositHmac(secret: string, value: string): string {
  if (secret.length < 32) throw new Error("The deposit HMAC secret must be at least 32 characters.");
  return bytesToHex(hmac(sha256, utf8ToBytes(secret), utf8ToBytes(value)));
}

/**
 * A unique check amount: the tester's base (at or above the service's minimum
 * deposit) plus 1 to 9,999 zatoshis. `random` is injectable for tests.
 */
const cryptoRandom = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

export function checkAmountZat(baseZat: number, random: () => number = cryptoRandom): number {
  if (!Number.isSafeInteger(baseZat) || baseZat <= 0) throw new Error("The base amount must be a positive whole number of zatoshis.");
  return baseZat + 1 + Math.floor(random() * 9_999);
}
