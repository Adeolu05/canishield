// Throwaway testnet wallet: create once, then reload from .wallet/ (gitignored).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { generateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { HDKey } from "@scure/bip32";
import { createBase58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import zcash from "@ledgerhq/zcash-utils";
import { NETWORK, WALLET_DIR, WALLET_FILE, assertTestnetUfvk } from "./config.js";

export interface Wallet {
  network: typeof NETWORK;
  /** Present only for wallets this spike generated. Testnet-only throwaway. */
  mnemonic?: string;
  ufvk: string;
  /** Account-level tpub (m/44'/1'/0'), used to derive the transparent address. */
  xpub?: string;
  birthdayHeight: number;
  createdAt: string;
}

// BIP32 version bytes for testnet extended keys (tpub/tprv).
const TESTNET_VERSIONS = { private: 0x04358394, public: 0x043587cf };
// Zcash testnet P2PKH prefix — encodes to addresses starting "tm".
const TESTNET_P2PKH_PREFIX = Uint8Array.of(0x1d, 0x25);

const base58check = createBase58check(sha256);

/** External-scope transparent address at index 0 (xpub/0/0). */
export function transparentAddressFromXpub(xpub: string): string {
  const child = HDKey.fromExtendedKey(xpub, TESTNET_VERSIONS).derive("m/0/0");
  const hash160 = ripemd160(sha256(child.publicKey!));
  return base58check.encode(new Uint8Array([...TESTNET_P2PKH_PREFIX, ...hash160]));
}

export function loadOrCreateWallet(tipHeight: number): { wallet: Wallet; created: boolean } {
  // View-only mode: bring your own testnet UFVK (e.g. exported from Zingo/Zashi testnet).
  const envUfvk = process.env.ZECPROOF_UFVK;
  if (envUfvk) {
    assertTestnetUfvk(envUfvk);
    const birthday = Number(process.env.ZECPROOF_BIRTHDAY ?? tipHeight - 1000);
    return {
      wallet: {
        network: NETWORK,
        ufvk: envUfvk,
        birthdayHeight: birthday,
        createdAt: new Date().toISOString(),
      },
      created: false,
    };
  }

  if (existsSync(WALLET_FILE)) {
    const wallet = JSON.parse(readFileSync(WALLET_FILE, "utf8")) as Wallet;
    if (wallet.network !== NETWORK) throw new Error(`Wallet file is not a ${NETWORK} wallet.`);
    assertTestnetUfvk(wallet.ufvk);
    return { wallet, created: false };
  }

  const mnemonic = generateMnemonic(wordlist, 256);
  // TEST-ONLY export: fine for a throwaway testnet key, never for real funds.
  const { ufvk, xpub } = zcash.testDeriveKeys(mnemonic, 0, NETWORK);
  assertTestnetUfvk(ufvk);
  const wallet: Wallet = {
    network: NETWORK,
    mnemonic,
    ufvk,
    xpub,
    birthdayHeight: tipHeight,
    createdAt: new Date().toISOString(),
  };
  mkdirSync(WALLET_DIR, { recursive: true });
  writeFileSync(WALLET_FILE, JSON.stringify(wallet, null, 2));
  return { wallet, created: true };
}
