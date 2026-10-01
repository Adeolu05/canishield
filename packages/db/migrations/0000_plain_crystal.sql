CREATE TYPE "public"."address_type" AS ENUM('ironwood_ua', 'full_ua', 'transparent');--> statement-breakpoint
CREATE TYPE "public"."pool" AS ENUM('ironwood', 'orchard', 'sapling', 'transparent');--> statement-breakpoint
CREATE TYPE "public"."report_outcome" AS ENUM('ironwood', 'orchard', 'sapling', 'transparent', 'address_rejected');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('unreviewed', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."service_kind" AS ENUM('exchange', 'wallet', 'swap', 'faucet', 'other');--> statement-breakpoint
CREATE TYPE "public"."test_status" AS ENUM('pending', 'awaiting_payment', 'received', 'address_rejected', 'expired', 'failed');--> statement-breakpoint
CREATE SEQUENCE "public"."test_account_index_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"address_type" "address_type",
	"outcome" "report_outcome" NOT NULL,
	"txid" text,
	"evidence_url" text,
	"note" text,
	"status" "report_status" DEFAULT 'unreviewed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" "service_kind" NOT NULL,
	"website_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"address_type" "address_type" NOT NULL,
	"status" "test_status" DEFAULT 'pending' NOT NULL,
	"network" text DEFAULT 'testnet' NOT NULL,
	"account_index" integer,
	"ufvk" text,
	"receive_address" text,
	"transparent_address" text,
	"birthday_height" integer,
	"scanned_to_height" integer,
	"received_pool" "pool",
	"received_txid" text,
	"received_height" integer,
	"received_amount_zat" bigint,
	"received_memo" text,
	"tester_note" text,
	"error" text,
	"assigned_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tests_account_index_unique" UNIQUE("account_index"),
	CONSTRAINT "tests_testnet_only" CHECK ("tests"."network" = 'testnet'),
	CONSTRAINT "tests_ufvk_testnet" CHECK ("tests"."ufvk" IS NULL OR "tests"."ufvk" LIKE 'uviewtest1%')
);
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_service_idx" ON "reports" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "tests_status_idx" ON "tests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tests_service_idx" ON "tests" USING btree ("service_id","address_type");