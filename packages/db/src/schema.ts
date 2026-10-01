// ZecProof data model.
//
// Three evidence tiers (docs/SPEC.md, "Evidence model"):
//   - tests with a receipt      → "on-chain verified": a throwaway key per
//                                 test, its viewing key published.
//   - reports, tier "community" → "community reported": observed but not
//                                 provable on-chain (e.g. a rejected address).
//   - reports, tier "listing"   → "unverified listing": imported from an
//                                 existing list, never tested.
//
// Networks: every test, report and pool key carries `network` with no default,
// and CHECK constraints tie keys and addresses to that network's encoding.
// Mainnet keys only ever come from an offline-generated key pool (keygen/).
import { sql, type SQL } from "drizzle-orm";
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
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const NETWORK_LIST = sql.raw("('mainnet', 'testnet')");

const ENCODING = {
  testnet: { ufvk: "uviewtest1", ua: "utest1", t: "tm" },
  mainnet: { ufvk: "uview1", ua: "u1", t: "t1" },
} as const;

/** Every listed column is NULL or encoded for the row's network (ua: UA only; address: UA or t-address). */
function matchesNetwork(
  network: AnyPgColumn,
  cols: { ufvk?: AnyPgColumn[]; ua?: AnyPgColumn[]; address?: AnyPgColumn[]; tAddress?: AnyPgColumn[] },
): SQL {
  const like = (c: AnyPgColumn, prefix: string) => sql`${c} LIKE ${sql.raw(`'${prefix}%'`)}`;
  const side = (net: keyof typeof ENCODING) => {
    const e = ENCODING[net];
    return sql.join(
      [
        sql`${network} = ${sql.raw(`'${net}'`)}`,
        ...(cols.ufvk ?? []).map((c) => sql`(${c} IS NULL OR ${like(c, e.ufvk)})`),
        ...(cols.ua ?? []).map((c) => sql`(${c} IS NULL OR ${like(c, e.ua)})`),
        ...(cols.address ?? []).map((c) => sql`(${c} IS NULL OR ${like(c, e.ua)} OR ${like(c, e.t)})`),
        ...(cols.tAddress ?? []).map((c) => sql`(${c} IS NULL OR ${like(c, e.t)})`),
      ],
      sql` AND `,
    );
  };
  return sql`(${side("testnet")}) OR (${side("mainnet")})`;
}

export const serviceKind = pgEnum("service_kind", ["exchange", "wallet", "swap", "faucet", "other"]);

// MVP test matrix. Sapling is deferred: the scanner can detect Sapling notes,
// but nothing in the stack can derive a Sapling receiver yet.
export const addressType = pgEnum("address_type", ["ironwood_ua", "full_ua", "transparent"]);

export const pool = pgEnum("pool", ["ironwood", "orchard", "sapling", "transparent"]);

export const testStatus = pgEnum("test_status", [
  "pending", // created by a tester, no address yet
  "awaiting_payment", // worker assigned an address and is watching it
  "received", // payment found, confirmed and (mainnet) explorer-checked
  "address_rejected", // tester says the service refused the address
  "expired", // nothing arrived before expires_at
  "failed", // worker error, see `error`
  "confirming", // payment seen; waiting for confirmations and the explorer check
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

export const keyStatus = pgEnum("key_status", [
  "available",
  "assigned", // handed to exactly one test
  "burned", // had on-chain history before first use, or retired by hand
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    kind: serviceKind("kind").notNull(),
    websiteUrl: text("website_url"),
    notes: text("notes"),
    /** Boards this service appears on. */
    networks: text("networks").array().notNull().default(sql`ARRAY['mainnet', 'testnet']::text[]`),
    ...timestamps,
  },
  (t) => [
    check(
      "services_networks_valid",
      sql`cardinality(${t.networks}) > 0 AND ${t.networks} <@ ARRAY['mainnet', 'testnet']::text[]`,
    ),
  ],
);

// One offline-generated batch of keys (keygen/). Seeds never reach the database.
export const keyBatches = pgTable(
  "key_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: text("batch_id").notNull().unique(), // from the batch file; re-import is refused
    network: text("network").notNull(),
    keyCount: integer("key_count").notNull(),
    birthdayHeight: integer("birthday_height").notNull(),
    derivation: text("derivation").notNull(), // library, version and path, from the batch file
    // The human check: one seed restored in a wallet showed matching receivers.
    verifiedIndex: integer("verified_index").notNull(),
    verifiedAddresses: text("verified_addresses").array().notNull(),
    verifiedReceivers: text("verified_receivers").array().notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("key_batches_network_valid", sql`${t.network} IN ${NETWORK_LIST}`)],
);

// One seed per entry; the worker only ever sees the viewing key and addresses.
export const keyPool = pgTable(
  "key_pool",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => keyBatches.id),
    batchIndex: integer("batch_index").notNull(),
    network: text("network").notNull(),
    ufvk: text("ufvk").notNull().unique(),
    ironwoodUa: text("ironwood_ua").notNull(),
    fullUa: text("full_ua").notNull(),
    transparentAddress: text("transparent_address").notNull(),
    birthdayHeight: integer("birthday_height").notNull(),
    status: keyStatus("status").notNull().default("available"),
    burnedReason: text("burned_reason"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("key_pool_batch_index").on(t.batchId, t.batchIndex),
    index("key_pool_available_idx").on(t.network, t.status),
    check("key_pool_network_valid", sql`${t.network} IN ${NETWORK_LIST}`),
    check(
      "key_pool_matches_network",
      matchesNetwork(t.network, {
        ufvk: [t.ufvk],
        ua: [t.ironwoodUa, t.fullUa],
        tAddress: [t.transparentAddress],
      }),
    ),
  ],
);

// ZIP-32 account index for testnet dev-mode keys. Account 0 is reserved;
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
    network: text("network").notNull(), // no default: callers must say which network

    // Set by the worker when it assigns the test's address. At most one of:
    //   accountIndex — testnet dev mode, derived from the worker's test seed
    //   keyId        — a key-pool entry (the only option on mainnet)
    accountIndex: integer("account_index"),
    keyId: uuid("key_id")
      .unique()
      .references(() => keyPool.id),
    ufvk: text("ufvk"), // published so anyone can re-verify the receipt
    receiveAddress: text("receive_address"), // what the tester pastes into the service
    transparentAddress: text("transparent_address"), // t-receiver, for full_ua / transparent
    birthdayHeight: integer("birthday_height"),
    scannedToHeight: integer("scanned_to_height"),

    // First payment found. Further payments are ignored for now.
    receivedPool: pool("received_pool"),
    receivedTxid: text("received_txid"),
    receivedHeight: integer("received_height"),
    receivedBlockHash: text("received_block_hash"), // shielded receipts only
    receivedAmountZat: bigint("received_amount_zat", { mode: "number" }),
    receivedMemo: text("received_memo"),

    // Independent explorer confirmation of txid + block (required on mainnet).
    explorerName: text("explorer_name"),
    explorerConfirmedAt: timestamp("explorer_confirmed_at", { withTimezone: true }),

    testerNote: text("tester_note"),
    error: text("error"),

    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("tests_status_idx").on(t.network, t.status),
    index("tests_service_idx").on(t.network, t.serviceId, t.addressType),
    unique("tests_network_account_index").on(t.network, t.accountIndex),
    check("tests_network_valid", sql`${t.network} IN ${NETWORK_LIST}`),
    check(
      "tests_matches_network",
      matchesNetwork(t.network, { ufvk: [t.ufvk], address: [t.receiveAddress], tAddress: [t.transparentAddress] }),
    ),
    // A mainnet key can never come from a seed the worker holds.
    check("tests_mainnet_uses_pool", sql`${t.network} <> 'mainnet' OR ${t.accountIndex} IS NULL`),
    check("tests_one_key_source", sql`${t.accountIndex} IS NULL OR ${t.keyId} IS NULL`),
  ],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    network: text("network").notNull(),
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
    index("reports_service_idx").on(t.network, t.serviceId),
    check("reports_network_valid", sql`${t.network} IN ${NETWORK_LIST}`),
    check("reports_listing_has_source", sql`${t.tier} <> 'listing' OR ${t.sourceUrl} IS NOT NULL`),
  ],
);

export type Service = typeof services.$inferSelect;
export type Test = typeof tests.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type KeyBatch = typeof keyBatches.$inferSelect;
export type PoolKey = typeof keyPool.$inferSelect;
export type AddressType = (typeof addressType.enumValues)[number];
export type Pool = (typeof pool.enumValues)[number];
export type TestStatus = (typeof testStatus.enumValues)[number];
export type ReportOutcome = (typeof reportOutcome.enumValues)[number];
export type ReportTier = (typeof reportTier.enumValues)[number];
