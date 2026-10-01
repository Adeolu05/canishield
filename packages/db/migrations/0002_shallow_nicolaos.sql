CREATE TYPE "public"."key_status" AS ENUM('available', 'assigned', 'burned');--> statement-breakpoint
ALTER TYPE "public"."test_status" ADD VALUE 'confirming';--> statement-breakpoint
CREATE TABLE "key_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" text NOT NULL,
	"network" text NOT NULL,
	"key_count" integer NOT NULL,
	"birthday_height" integer NOT NULL,
	"derivation" text NOT NULL,
	"verified_index" integer NOT NULL,
	"verified_addresses" text[] NOT NULL,
	"verified_receivers" text[] NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "key_batches_batch_id_unique" UNIQUE("batch_id"),
	CONSTRAINT "key_batches_network_valid" CHECK ("key_batches"."network" IN ('mainnet', 'testnet'))
);
--> statement-breakpoint
CREATE TABLE "key_pool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"batch_index" integer NOT NULL,
	"network" text NOT NULL,
	"ufvk" text NOT NULL,
	"ironwood_ua" text NOT NULL,
	"full_ua" text NOT NULL,
	"transparent_address" text NOT NULL,
	"birthday_height" integer NOT NULL,
	"status" "key_status" DEFAULT 'available' NOT NULL,
	"burned_reason" text,
	"assigned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "key_pool_ufvk_unique" UNIQUE("ufvk"),
	CONSTRAINT "key_pool_batch_index" UNIQUE("batch_id","batch_index"),
	CONSTRAINT "key_pool_network_valid" CHECK ("key_pool"."network" IN ('mainnet', 'testnet')),
	CONSTRAINT "key_pool_matches_network" CHECK (("key_pool"."network" = 'testnet' AND ("key_pool"."ufvk" IS NULL OR "key_pool"."ufvk" LIKE 'uviewtest1%') AND ("key_pool"."ironwood_ua" IS NULL OR "key_pool"."ironwood_ua" LIKE 'utest1%') AND ("key_pool"."full_ua" IS NULL OR "key_pool"."full_ua" LIKE 'utest1%') AND ("key_pool"."transparent_address" IS NULL OR "key_pool"."transparent_address" LIKE 'tm%')) OR ("key_pool"."network" = 'mainnet' AND ("key_pool"."ufvk" IS NULL OR "key_pool"."ufvk" LIKE 'uview1%') AND ("key_pool"."ironwood_ua" IS NULL OR "key_pool"."ironwood_ua" LIKE 'u1%') AND ("key_pool"."full_ua" IS NULL OR "key_pool"."full_ua" LIKE 'u1%') AND ("key_pool"."transparent_address" IS NULL OR "key_pool"."transparent_address" LIKE 't1%')))
);
--> statement-breakpoint
ALTER TABLE "tests" DROP CONSTRAINT "tests_account_index_unique";--> statement-breakpoint
ALTER TABLE "tests" DROP CONSTRAINT "tests_testnet_only";--> statement-breakpoint
ALTER TABLE "tests" DROP CONSTRAINT "tests_ufvk_testnet";--> statement-breakpoint
DROP INDEX "reports_service_idx";--> statement-breakpoint
DROP INDEX "tests_status_idx";--> statement-breakpoint
DROP INDEX "tests_service_idx";--> statement-breakpoint
ALTER TABLE "tests" ALTER COLUMN "network" DROP DEFAULT;--> statement-breakpoint
-- Existing reports predate mainnet support: back-fill as testnet, then require callers to say.
ALTER TABLE "reports" ADD COLUMN "network" text DEFAULT 'testnet' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "network" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "networks" text[] DEFAULT ARRAY['mainnet', 'testnet']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN "key_id" uuid;--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN "received_block_hash" text;--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN "explorer_name" text;--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN "explorer_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "key_pool" ADD CONSTRAINT "key_pool_batch_id_key_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."key_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "key_pool_available_idx" ON "key_pool" USING btree ("network","status");--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_key_id_key_pool_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."key_pool"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_service_idx" ON "reports" USING btree ("network","service_id");--> statement-breakpoint
CREATE INDEX "tests_status_idx" ON "tests" USING btree ("network","status");--> statement-breakpoint
CREATE INDEX "tests_service_idx" ON "tests" USING btree ("network","service_id","address_type");--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_key_id_unique" UNIQUE("key_id");--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_network_account_index" UNIQUE("network","account_index");--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_network_valid" CHECK ("reports"."network" IN ('mainnet', 'testnet'));--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_networks_valid" CHECK (cardinality("services"."networks") > 0 AND "services"."networks" <@ ARRAY['mainnet', 'testnet']::text[]);--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_network_valid" CHECK ("tests"."network" IN ('mainnet', 'testnet'));--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_matches_network" CHECK (("tests"."network" = 'testnet' AND ("tests"."ufvk" IS NULL OR "tests"."ufvk" LIKE 'uviewtest1%') AND ("tests"."receive_address" IS NULL OR "tests"."receive_address" LIKE 'utest1%' OR "tests"."receive_address" LIKE 'tm%') AND ("tests"."transparent_address" IS NULL OR "tests"."transparent_address" LIKE 'tm%')) OR ("tests"."network" = 'mainnet' AND ("tests"."ufvk" IS NULL OR "tests"."ufvk" LIKE 'uview1%') AND ("tests"."receive_address" IS NULL OR "tests"."receive_address" LIKE 'u1%' OR "tests"."receive_address" LIKE 't1%') AND ("tests"."transparent_address" IS NULL OR "tests"."transparent_address" LIKE 't1%')));--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_mainnet_uses_pool" CHECK ("tests"."network" <> 'mainnet' OR "tests"."account_index" IS NULL);--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_one_key_source" CHECK ("tests"."account_index" IS NULL OR "tests"."key_id" IS NULL);