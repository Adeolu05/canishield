// Offline key generation: one fresh BIP-39 seed per test.
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import zcash from "@ledgerhq/zcash-utils";
import { BATCH_FORMAT, testAddresses, type BatchPublic, type NetworkId } from "@zecproof/zcash";
import { encryptSeeds, type SeedEntry, type SeedsFile } from "./crypto";

const LIB_VERSION = (createRequire(import.meta.url)("@ledgerhq/zcash-utils/package.json") as { version: string }).version;
const COIN_TYPE: Record<NetworkId, number> = { mainnet: 133, testnet: 1 };

/** Which library derives the keys, and how. Recorded in every batch file. */
export const derivationDescription = (network: NetworkId) =>
  [
    `@ledgerhq/zcash-utils@${LIB_VERSION} testDeriveKeys(seed, account 0, "${network}")`,
    `BIP-39 24-word seed; ZIP-32 account 0 (UFVK); transparent xpub m/44'/${COIN_TYPE[network]}'/0'`,
    `addresses: Orchard receiver at diversifier 0 (orchardAddressFromUfvk); P2PKH at xpub/0/0`,
  ].join("; ");

export function newBatchId(network: NetworkId) {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `${network}-${date}-${randomBytes(3).toString("hex")}`;
}

export function generateBatch(opts: {
  network: NetworkId;
  count: number;
  birthdayHeight: number;
  passphrase: string;
}): { batch: BatchPublic; seeds: SeedsFile } {
  const { network, count, birthdayHeight, passphrase } = opts;
  if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error("--count must be 1–500.");
  if (!Number.isInteger(birthdayHeight) || birthdayHeight < 1) throw new Error("--birthday must be a block height.");

  const batchId = newBatchId(network);
  const seeds: SeedEntry[] = [];
  const keys = [];
  for (let index = 0; index < count; index++) {
    const mnemonic = generateMnemonic(wordlist, 256);
    // "TEST-ONLY" in the package because a production host must never hold a
    // seed in memory. Here the host is an offline machine that exists to do
    // exactly that, once, and keeps only the encrypted output.
    const { ufvk, xpub } = zcash.testDeriveKeys(mnemonic, 0, network);
    seeds.push({ index, mnemonic });
    keys.push({ index, ufvk, xpub, ...testAddresses(ufvk, xpub, network) });
  }
  return {
    batch: {
      format: BATCH_FORMAT,
      batchId,
      network,
      createdAt: new Date().toISOString(),
      birthdayHeight,
      derivation: derivationDescription(network),
      keys,
    },
    seeds: encryptSeeds(batchId, network, seeds, passphrase),
  };
}
