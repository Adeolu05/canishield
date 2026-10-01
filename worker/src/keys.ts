// Per-test throwaway testnet keys: one ZIP-32 account per test, so each
// test's viewing key can be published without exposing any other test.
import { HDKey } from "@scure/bip32";
import { createBase58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import zcash from "@ledgerhq/zcash-utils";
import type { AddressType } from "@zecproof/db";
import { NETWORK, assertTestnetUfvk } from "./config";
import { Typecode, decodeUnifiedAddress, encodeUnifiedAddress } from "./ua";

// BIP32 version bytes for testnet extended keys (tpub/tprv).
const TESTNET_VERSIONS = { private: 0x04358394, public: 0x043587cf };
// Zcash testnet P2PKH prefix — encodes to addresses starting "tm".
const TESTNET_P2PKH_PREFIX = Uint8Array.of(0x1d, 0x25);
const base58check = createBase58check(sha256);

export interface TestKeys {
  ufvk: string;
  /** What the tester pastes into the service's withdrawal form. */
  receiveAddress: string;
  /** Present when the test can receive transparent funds. */
  transparentAddress?: string;
}

/** hash160 of the external-scope transparent key at index 0 (xpub/0/0). */
function p2pkhHash(xpub: string) {
  const child = HDKey.fromExtendedKey(xpub, TESTNET_VERSIONS).derive("m/0/0");
  return ripemd160(sha256(child.publicKey!));
}

export function deriveTestKeys(mnemonic: string, accountIndex: number, type: AddressType): TestKeys {
  if (accountIndex < 1) throw new Error("Account 0 is reserved; test accounts start at 1.");
  // TEST-ONLY export of the package: acceptable for throwaway testnet keys only.
  const { ufvk, xpub } = zcash.testDeriveKeys(mnemonic, accountIndex, NETWORK);
  assertTestnetUfvk(ufvk);

  const hash = p2pkhHash(xpub);
  const transparentAddress = base58check.encode(new Uint8Array([...TESTNET_P2PKH_PREFIX, ...hash]));
  // Single Orchard receiver. Post-NU6.3, payments to it land in Ironwood.
  const ironwoodUa = zcash.orchardAddressFromUfvk(ufvk);

  switch (type) {
    case "ironwood_ua":
      return { ufvk, receiveAddress: ironwoodUa };
    case "transparent":
      return { ufvk, receiveAddress: transparentAddress, transparentAddress };
    case "full_ua": {
      // Orchard + P2PKH. No Sapling receiver: nothing here can derive one yet.
      const { hrp, receivers } = decodeUnifiedAddress(ironwoodUa);
      const orchard = receivers.find((r) => r.typecode === Typecode.Orchard);
      if (!orchard) throw new Error("Orchard UA has no Orchard receiver");
      const receiveAddress = encodeUnifiedAddress(hrp, [orchard, { typecode: Typecode.P2PKH, data: hash }]);
      return { ufvk, receiveAddress, transparentAddress };
    }
  }
}
