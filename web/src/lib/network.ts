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
