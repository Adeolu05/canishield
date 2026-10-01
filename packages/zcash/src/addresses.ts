// Test addresses for one account, from its UFVK and account xpub.
import { HDKey } from "@scure/bip32";
import { createBase58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import zcash from "@ledgerhq/zcash-utils";
import { NETWORKS, type NetworkId } from "./networks";
import { Typecode, decodeUnifiedAddress, encodeUnifiedAddress, type Receiver } from "./ua";

const base58check = createBase58check(sha256);

export interface TestAddresses {
  /** Single Orchard receiver. Post-NU6.3, payments to it land in Ironwood. */
  ironwoodUa: string;
  /** Orchard + P2PKH. No Sapling receiver: nothing here derives one yet. */
  fullUa: string;
  transparentAddress: string;
}

export function assertNetworkUfvk(ufvk: string, network: NetworkId) {
  const prefix = NETWORKS[network].ufvkPrefix;
  // "uview1" is a prefix of nothing testnet, but "uviewtest1" does not start with "uview1".
  if (!ufvk.startsWith(prefix)) {
    throw new Error(`Viewing key "${ufvk.slice(0, 10)}…" is not a ${network} UFVK (expected ${prefix}…).`);
  }
}

/** hash160 of the external-scope transparent key at index 0 (xpub/0/0). */
export function p2pkhHash(xpub: string, network: NetworkId): Uint8Array {
  const child = HDKey.fromExtendedKey(xpub, NETWORKS[network].bip32Versions).derive("m/0/0");
  return ripemd160(sha256(child.publicKey!));
}

export function encodeP2pkh(hash: Uint8Array, network: NetworkId): string {
  return base58check.encode(new Uint8Array([...NETWORKS[network].p2pkhVersion, ...hash]));
}

export function decodeP2pkh(address: string, network: NetworkId): Uint8Array {
  const raw = base58check.decode(address);
  const version = NETWORKS[network].p2pkhVersion;
  if (raw.length !== 22 || raw[0] !== version[0] || raw[1] !== version[1]) {
    throw new Error(`"${address}" is not a ${network} P2PKH address.`);
  }
  return raw.slice(2);
}

export function testAddresses(ufvk: string, xpub: string, network: NetworkId): TestAddresses {
  assertNetworkUfvk(ufvk, network);
  const hash = p2pkhHash(xpub, network);
  const ironwoodUa = zcash.orchardAddressFromUfvk(ufvk);
  const { hrp, receivers } = decodeUnifiedAddress(ironwoodUa);
  if (hrp !== NETWORKS[network].uaHrp) throw new Error(`UA has HRP "${hrp}", expected ${NETWORKS[network].uaHrp}`);
  const orchard = receivers.find((r) => r.typecode === Typecode.Orchard);
  if (!orchard) throw new Error("Orchard UA has no Orchard receiver");
  return {
    ironwoodUa,
    fullUa: encodeUnifiedAddress(hrp, [orchard, { typecode: Typecode.P2PKH, data: hash }]),
    transparentAddress: encodeP2pkh(hash, network),
  };
}

/** Receivers in any address string: a UA (any receivers) or a bare t-address. */
export function receiversOf(address: string, network: NetworkId): Receiver[] {
  if (address.startsWith(NETWORKS[network].tAddressPrefix)) {
    return [{ typecode: Typecode.P2PKH, data: decodeP2pkh(address, network) }];
  }
  const { hrp, receivers } = decodeUnifiedAddress(address);
  if (hrp !== NETWORKS[network].uaHrp) throw new Error(`"${address.slice(0, 12)}…" is not a ${network} unified address.`);
  return receivers;
}
