// Testnet-only by construction. There is deliberately no switch to mainnet.
export const NETWORK = "testnet" as const;

export const GRPC_URL = process.env.ZECPROOF_GRPC_URL ?? "https://testnet.zec.rocks:443";
export const POLL_INTERVAL_MS = 30_000;
export const TEST_TTL_HOURS = Number(process.env.TEST_TTL_HOURS ?? 48);

export function assertTestnetUfvk(ufvk: string) {
  if (!ufvk.startsWith("uviewtest1")) {
    throw new Error(`Refusing viewing key "${ufvk.slice(0, 10)}…": only testnet UFVKs (uviewtest1…) are allowed.`);
  }
}

export function requireMnemonic(): string {
  const m = process.env.WORKER_TEST_MNEMONIC?.trim();
  if (!m) throw new Error("WORKER_TEST_MNEMONIC is not set. Generate one with: npm run new-mnemonic -w worker");
  return m;
}
