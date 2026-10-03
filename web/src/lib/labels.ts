import type { AddressType, Pool, ReportOutcome, TestStatus } from "@zecproof/db";

export { ADDRESS_TYPES } from "./evidence";

export const ADDRESS_TYPE_LABEL: Record<AddressType, string> = {
  ironwood_ua: "Ironwood-only UA",
  full_ua: "Full UA",
  transparent: "Transparent",
};

export const ADDRESS_TYPE_HINT: Record<AddressType, string> = {
  ironwood_ua: "Unified address with only a shielded (Orchard/Ironwood) receiver.",
  full_ua: "Unified address with shielded + transparent receivers. Sapling receiver not included yet.",
  transparent: "Plain t-address (t1… on mainnet, tm… on testnet).",
};

export type Tier = "verified" | "community" | "listing";

export const TIER_LABEL: Record<Tier, string> = {
  verified: "On-chain verified",
  community: "Community reported",
  listing: "Unverified listing",
};

export const POOL_LABEL: Record<Pool, string> = {
  ironwood: "Ironwood",
  orchard: "Orchard",
  sapling: "Sapling",
  transparent: "Transparent",
};

export const OUTCOME_LABEL: Record<ReportOutcome, string> = {
  ...POOL_LABEL,
  address_rejected: "Address rejected",
  form_accepted: "Form accepted",
};

export const STATUS_LABEL: Record<TestStatus, string> = {
  pending: "Preparing address",
  awaiting_payment: "Waiting for payment",
  received: "Payment verified",
  confirming: "Payment seen, confirming",
  address_rejected: "Address rejected by service",
  expired: "Expired",
  failed: "Failed",
};
