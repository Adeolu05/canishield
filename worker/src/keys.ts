// Testnet dev mode: per-test keys derived from the worker's own test seed
// (one ZIP-32 account per test). Never used on mainnet — see pool.ts.
import zcash from "@ledgerhq/zcash-utils";
import type { AddressType } from "@zecproof/db";
import { testAddresses } from "@zecproof/zcash";

export interface TestKeys {
  ufvk: string;
  /** What the tester pastes into the service's withdrawal form. */
  receiveAddress: string;
  /** Present when the test can receive transparent funds. */
  transparentAddress?: string;
}

/** Picks the address a test hands out from a key's three test addresses. */
export function addressesForType(
  a: { ironwoodUa: string; fullUa: string; transparentAddress: string },
  type: AddressType,
): Omit<TestKeys, "ufvk"> {
  switch (type) {
    case "ironwood_ua":
      return { receiveAddress: a.ironwoodUa };
    case "full_ua":
      return { receiveAddress: a.fullUa, transparentAddress: a.transparentAddress };
    case "transparent":
      return { receiveAddress: a.transparentAddress, transparentAddress: a.transparentAddress };
  }
}

export function deriveTestKeys(mnemonic: string, accountIndex: number, type: AddressType): TestKeys {
  if (accountIndex < 1) throw new Error("Account 0 is reserved; test accounts start at 1.");
  // TEST-ONLY export of the package: acceptable for throwaway testnet keys only.
  const { ufvk, xpub } = zcash.testDeriveKeys(mnemonic, accountIndex, "testnet");
  return { ufvk, ...addressesForType(testAddresses(ufvk, xpub, "testnet"), type) };
}
