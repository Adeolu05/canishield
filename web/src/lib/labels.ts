import type { AddressType, Pool, ReportOutcome, TestStatus } from "@zecproof/db";

export { ADDRESS_TYPES } from "./evidence";

export const ADDRESS_TYPE_LABEL: Record<AddressType, string> = {
  ironwood_ua: "Shielded-only address",
  full_ua: "Mixed address",
  transparent: "Transparent address",
};

/** The technical name, shown smaller under the plain label. */
export const ADDRESS_TYPE_TECHNICAL: Record<AddressType, string> = {
  ironwood_ua: "Ironwood-only unified address",
  full_ua: "Full unified address",
  transparent: "t-address",
};

export const ADDRESS_TYPE_HINT: Record<AddressType, string> = {
  ironwood_ua: "Ironwood-only unified address. Only the current shielded receiver.",
  full_ua: "Full unified address. A shielded receiver and a transparent one. No Sapling receiver yet.",
  transparent: "A normal t-address (t1 on mainnet, tm on testnet).",
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
