// Testnet-only by construction. There is deliberately no switch to mainnet.
export const NETWORK = "testnet" as const;

// Tried in order each cycle; the first that answers and reports chain "test"
// is used for the whole cycle. Override with a comma-separated list.
// Defaults: ECC lightwalletd and ZingoLabs Zaino, both run by zec.rocks.
export const GRPC_URLS = (
  process.env.ZECPROOF_GRPC_URLS ?? "https://testnet.zec.rocks:443,https://zaino.testnet.unsafe.zec.rocks:443"
)
  .split(",")
  .map((u) => u.trim())
  .filter(Boolean);

export const POLL_INTERVAL_MS = 30_000;
export const ENDPOINT_TIMEOUT_MS = 10_000;
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
