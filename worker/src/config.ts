// Worker configuration. One worker process serves exactly one network.
//
// Mainnet is off unless BOTH ZECPROOF_NETWORK=mainnet and
// ZECPROOF_ALLOW_MAINNET=yes are set. A mainnet worker uses only the
// offline-generated key pool and refuses to start if any seed is readable.
// A pool worker on either network refuses a seed too (see worker/Dockerfile).
import { NETWORKS, isNetworkId, type NetworkId, type NetworkProfile } from "@zecproof/zcash/networks";

export class ConfigError extends Error {}

function resolveNetwork(env = process.env): NetworkId {
  const n = env.ZECPROOF_NETWORK ?? "testnet";
  if (!isNetworkId(n)) throw new ConfigError(`ZECPROOF_NETWORK must be "testnet" or "mainnet", got "${n}".`);
  if (n === "mainnet" && env.ZECPROOF_ALLOW_MAINNET !== "yes") {
    throw new ConfigError("Mainnet is disabled. Set ZECPROOF_ALLOW_MAINNET=yes as well as ZECPROOF_NETWORK=mainnet.");
  }
  return n;
}

export type KeySource = "derived" | "pool";

function resolveKeySource(network: NetworkId, env = process.env): KeySource {
  if (network === "mainnet") {
    if (env.WORKER_TEST_MNEMONIC) {
      throw new ConfigError(
        "WORKER_TEST_MNEMONIC is set. The mainnet worker must not be able to read any seed: remove it from this worker's environment.",
      );
    }
    if (env.ZECPROOF_KEY_SOURCE && env.ZECPROOF_KEY_SOURCE !== "pool") {
      throw new ConfigError("Mainnet tests can only use the key pool (ZECPROOF_KEY_SOURCE=pool).");
    }
    return "pool";
  }
  const source = env.ZECPROOF_KEY_SOURCE ?? (env.WORKER_TEST_MNEMONIC ? "derived" : "pool");
  if (source !== "derived" && source !== "pool") throw new ConfigError(`Unknown ZECPROOF_KEY_SOURCE "${source}".`);
  // A pool worker holds viewing keys only. The Docker image (worker/Dockerfile)
  // pins the pool, so a hosted worker never runs with a seed in its environment.
  if (source === "pool" && env.WORKER_TEST_MNEMONIC) {
    throw new ConfigError("WORKER_TEST_MNEMONIC is set but this worker uses the key pool: remove the seed from its environment.");
  }
  return source;
}

export interface WorkerConfig {
  network: NetworkId;
  profile: NetworkProfile;
  keySource: KeySource;
  grpcUrls: string[];
  requiredConfirmations: number;
  explorerCheck: boolean;
  testTtlHours: number;
}

export function loadConfig(env = process.env): WorkerConfig {
  const network = resolveNetwork(env);
  const profile = NETWORKS[network];
  // Separate variables per network, so one network's list can never be used for the other.
  const urlVar = network === "mainnet" ? "ZECPROOF_MAINNET_GRPC_URLS" : "ZECPROOF_TESTNET_GRPC_URLS";
  const grpcUrls = (env[urlVar] ?? profile.defaultEndpoints.join(","))
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  const asked = Number(env.ZECPROOF_REQUIRED_CONFIRMATIONS ?? profile.requiredConfirmations);
  return {
    network,
    profile,
    keySource: resolveKeySource(network, env),
    grpcUrls,
    // Can be raised (e.g. to rehearse mainnet rules on testnet), never lowered below the network's floor.
    requiredConfirmations: Math.max(profile.requiredConfirmations, Number.isFinite(asked) ? asked : 0),
    explorerCheck: profile.requireExplorerCheck || env.ZECPROOF_EXPLORER_CHECK === "on",
    testTtlHours: Number(env.TEST_TTL_HOURS ?? 48),
  };
}

export const POLL_INTERVAL_MS = 30_000;
export const ENDPOINT_TIMEOUT_MS = 10_000;

export function requireTestMnemonic(env = process.env): string {
  const m = env.WORKER_TEST_MNEMONIC?.trim();
  if (!m) throw new ConfigError("WORKER_TEST_MNEMONIC is not set. Generate one with: npm run new-mnemonic -w worker");
  return m;
}
