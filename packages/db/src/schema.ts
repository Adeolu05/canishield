// ZecProof data model.
//
// Three evidence tiers (docs/SPEC.md, "Evidence model"):
//   - tests with a receipt      → "on-chain verified": a throwaway testnet key
//                                 per test, its viewing key published.
//   - reports, tier "community" → "community reported": observed but not
//                                 provable on-chain (e.g. a rejected address).
//   - reports, tier "listing"   → "unverified listing": imported from an
//                                 existing list, never tested.
import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const serviceKind = pgEnum("service_kind", ["exchange", "wallet", "swap", "faucet", "other"]);

// MVP test matrix. Sapling is deferred: the scanner can detect Sapling notes,
// but nothing in the stack can derive a Sapling receiver yet.
export const addressType = pgEnum("address_type", ["ironwood_ua", "full_ua", "transparent"]);

export const pool = pgEnum("pool", ["ironwood", "orchard", "sapling", "transparent"]);

export const testStatus = pgEnum("test_status", [
  "pending", // created by a tester, no address yet
  "awaiting_payment", // worker derived an address and is watching it
  "received", // payment found on-chain
  "address_rejected", // tester says the service refused the address
  "expired", // nothing arrived before expires_at
  "failed", // worker error, see `error`
]);

export const reportOutcome = pgEnum("report_outcome", [
  "ironwood",
  "orchard",
  "sapling",
  "transparent",
  "address_rejected", // the service's form refused the address
  "form_accepted", // the form took the address; nothing was withdrawn
]);

export const reportTier = pgEnum("report_tier", ["community", "listing"]);

export const reportStatus = pgEnum("report_status", ["unreviewed", "accepted", "rejected"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: serviceKind("kind").notNull(),
  websiteUrl: text("website_url"),
  notes: text("notes"),
  ...timestamps,
});

// ZIP-32 account index for each test's throwaway key. Account 0 is reserved;
// ZIP-32 hardened account indexes must stay below 2^31.
export const testAccountIndexSeq = pgSequence("test_account_index_seq", {
  startWith: 1,
  minValue: 1,
  maxValue: 2147483647,
});

export const tests = pgTable(
  "tests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    addressType: addressType("address_type").notNull(),
    status: testStatus("status").notNull().default("pending"),
    network: text("network").notNull().default("testnet"),

    // Set by the worker when it derives the test's address.
    accountIndex: integer("account_index").unique(),
    ufvk: text("ufvk"), // published so anyone can re-verify the receipt
    receiveAddress: text("receive_address"), // what the tester pastes into the service
    transparentAddress: text("transparent_address"), // t-receiver, for full_ua / transparent
    birthdayHeight: integer("birthday_height"),
    scannedToHeight: integer("scanned_to_height"),

    // First payment found. Further payments are ignored for now.
    receivedPool: pool("received_pool"),
    receivedTxid: text("received_txid"),
    receivedHeight: integer("received_height"),
    receivedAmountZat: bigint("received_amount_zat", { mode: "number" }),
    receivedMemo: text("received_memo"),

    testerNote: text("tester_note"),
    error: text("error"),

    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("tests_status_idx").on(t.status),
    index("tests_service_idx").on(t.serviceId, t.addressType),
    check("tests_testnet_only", sql`${t.network} = 'testnet'`),
    check(
      "tests_ufvk_testnet",
      sql`${t.ufvk} IS NULL OR ${t.ufvk} LIKE 'uviewtest1%'`,
    ),
  ],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    tier: reportTier("tier").notNull().default("community"),
    // Set when the report came from a test (e.g. the tester marked the address rejected).
    testId: uuid("test_id").references(() => tests.id, { onDelete: "set null" }),
    addressType: addressType("address_type"),
    outcome: reportOutcome("outcome").notNull(),
    txid: text("txid"),
    evidenceUrl: text("evidence_url"), // screenshot link; no upload storage yet
    sourceUrl: text("source_url"), // where an unverified listing was imported from
    note: text("note"),
    status: reportStatus("status").notNull().default("unreviewed"),
    ...timestamps,
  },
  (t) => [
    index("reports_service_idx").on(t.serviceId),
    check("reports_listing_has_source", sql`${t.tier} <> 'listing' OR ${t.sourceUrl} IS NOT NULL`),
  ],
);

export type Service = typeof services.$inferSelect;
export type Test = typeof tests.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type AddressType = (typeof addressType.enumValues)[number];
export type Pool = (typeof pool.enumValues)[number];
export type TestStatus = (typeof testStatus.enumValues)[number];
export type ReportOutcome = (typeof reportOutcome.enumValues)[number];
export type ReportTier = (typeof reportTier.enumValues)[number];
