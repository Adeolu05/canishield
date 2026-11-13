import { NETWORKS, type NetworkId } from "@zecproof/zcash/networks";

export type { NetworkId };
export { NETWORKS };

/** Mainnet lives at "/", testnet under "/testnet". */
export const basePath = (network: NetworkId) => (network === "mainnet" ? "" : "/testnet");

export const NETWORK_LABEL: Record<NetworkId, string> = { mainnet: "Mainnet", testnet: "Testnet" };

/**
 * Creating mainnet tests is off unless ZECPROOF_ENABLE_MAINNET_TESTS=yes.
 * Testnet tests are always allowed.
 */
export const canCreateTests = (network: NetworkId) =>
  network === "testnet" || process.env.ZECPROOF_ENABLE_MAINNET_TESTS === "yes";

export const formatAmount = (zat: number, network: NetworkId) =>
  `${(zat / 1e8).toFixed(8).replace(/\.?0+$/, "")} ${NETWORKS[network].unit}`;

/**
 * Public outcome reports (/report/outcome) are on unless
 * ZECPROOF_DISABLE_OUTCOME_REPORTS=yes: a kill switch if spam ever gets through.
 * Every report still waits for the maintainer's review before it counts.
 */
export const outcomeReportsEnabled = () => process.env.ZECPROOF_DISABLE_OUTCOME_REPORTS !== "yes";
