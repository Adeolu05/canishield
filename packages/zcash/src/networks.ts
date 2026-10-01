// Per-network constants. No native code here: safe to import from the web app.

export const NETWORK_IDS = ["mainnet", "testnet"] as const;
export type NetworkId = (typeof NETWORK_IDS)[number];

export const isNetworkId = (v: unknown): v is NetworkId =>
  typeof v === "string" && (NETWORK_IDS as readonly string[]).includes(v);

export interface NetworkProfile {
  id: NetworkId;
  /** What lightwalletd/Zaino report in GetLightdInfo.chainName. */
  chainName: "main" | "test";
  /** Coin name for amounts. */
  unit: "ZEC" | "TAZ";
  ufvkPrefix: string;
  uaHrp: string;
  /** Leading characters of a P2PKH address on this network. */
  tAddressPrefix: string;
  p2pkhVersion: Uint8Array;
  /** BIP32 version bytes for the account xpub returned by key derivation. */
  bip32Versions: { private: number; public: number };
  defaultEndpoints: string[];
  /** Confirmations before a receipt counts as verified. */
  requiredConfirmations: number;
  /** Whether an independent explorer must confirm the txid before "verified". */
  requireExplorerCheck: boolean;
  /** Human-facing transaction page. */
  explorerTxUrl: (txid: string) => string;
}

export const NETWORKS: Record<NetworkId, NetworkProfile> = {
  testnet: {
    id: "testnet",
    chainName: "test",
    unit: "TAZ",
    ufvkPrefix: "uviewtest1",
    uaHrp: "utest",
    tAddressPrefix: "tm",
    p2pkhVersion: Uint8Array.of(0x1d, 0x25),
    bip32Versions: { private: 0x04358394, public: 0x043587cf }, // tprv / tpub
    // ECC lightwalletd and ZingoLabs Zaino, both run by zec.rocks.
    defaultEndpoints: ["https://testnet.zec.rocks:443", "https://zaino.testnet.unsafe.zec.rocks:443"],
    requiredConfirmations: 1,
    requireExplorerCheck: false,
    explorerTxUrl: (txid) => `https://testnet.zecblock.com/tx/${txid}`,
  },
  mainnet: {
    id: "mainnet",
    chainName: "main",
    unit: "ZEC",
    ufvkPrefix: "uview1",
    uaHrp: "u",
    tAddressPrefix: "t1",
    p2pkhVersion: Uint8Array.of(0x1c, 0xb8),
    bip32Versions: { private: 0x0488ade4, public: 0x0488b21e }, // xprv / xpub
    // All currently reachable public mainnet servers are run by zec.rocks.
    defaultEndpoints: ["https://na.zec.rocks:443", "https://eu.zec.rocks:443", "https://zaino.unsafe.zec.rocks:443"],
    requiredConfirmations: 10,
    requireExplorerCheck: true,
    explorerTxUrl: (txid) => `https://zecblock.com/tx/${txid}`,
  },
};

/** Cheap prefix check; full decoding lives in ./addresses. */
export function looksLikeNetworkAddress(address: string, network: NetworkId): boolean {
  const p = NETWORKS[network];
  return address.startsWith(`${p.uaHrp}1`) || address.startsWith(p.tAddressPrefix);
}
