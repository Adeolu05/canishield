// Testnet-only by construction. There is deliberately no switch to mainnet.
export const NETWORK = "testnet" as const;

export const GRPC_URL = process.env.ZECPROOF_GRPC_URL ?? "https://testnet.zec.rocks:443";

export const WALLET_DIR = new URL("../.wallet/", import.meta.url);
export const WALLET_FILE = new URL("testnet-wallet.json", WALLET_DIR);

export const POLL_INTERVAL_MS = 30_000;

// 1 ZEC = 1e8 zatoshis. Testnet coins are called TAZ.
export const formatTaz = (zat: number) => `${(zat / 1e8).toFixed(8)} TAZ`;

export function assertTestnetUfvk(ufvk: string) {
  if (!ufvk.startsWith("uviewtest1")) {
    throw new Error(
      `Refusing viewing key "${ufvk.slice(0, 10)}…": this spike only accepts testnet UFVKs (uviewtest1…).`,
    );
  }
}
