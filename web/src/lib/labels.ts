import type { AddressType, Pool, TestStatus } from "@zecproof/db";

export const ADDRESS_TYPES: AddressType[] = ["ironwood_ua", "full_ua", "transparent"];

export const ADDRESS_TYPE_LABEL: Record<AddressType, string> = {
  ironwood_ua: "Ironwood-only UA",
  full_ua: "Full UA",
  transparent: "Transparent",
};

export const ADDRESS_TYPE_HINT: Record<AddressType, string> = {
  ironwood_ua: "Unified address with only a shielded (Orchard/Ironwood) receiver.",
  full_ua: "Unified address with shielded + transparent receivers. Sapling receiver not included yet.",
  transparent: "Plain t-address (tm…).",
};

export const POOL_LABEL: Record<Pool, string> = {
  ironwood: "Ironwood",
  orchard: "Orchard",
  sapling: "Sapling",
  transparent: "Transparent",
};

export const STATUS_LABEL: Record<TestStatus, string> = {
  pending: "Preparing address",
  awaiting_payment: "Waiting for payment",
  received: "Payment received",
  address_rejected: "Address rejected by service",
  expired: "Expired",
  failed: "Failed",
};

export const formatTaz = (zat: number) => `${(zat / 1e8).toFixed(8).replace(/\.?0+$/, "")} TAZ`;
