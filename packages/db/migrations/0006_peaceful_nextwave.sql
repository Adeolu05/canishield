CREATE TYPE "public"."report_method" AS ENUM('withdrawal_form_check');--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "method" "report_method";--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "error_text" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_form_check_outcome" CHECK ("reports"."method" IS NULL OR ("reports"."tier" = 'community' AND "reports"."outcome" IN ('form_accepted', 'address_rejected') AND "reports"."address_type" IS NOT NULL AND "reports"."address" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_address_network" CHECK (("reports"."network" = 'testnet' AND ("reports"."address" IS NULL OR "reports"."address" LIKE 'utest1%' OR "reports"."address" LIKE 'tm%')) OR ("reports"."network" = 'mainnet' AND ("reports"."address" IS NULL OR "reports"."address" LIKE 'u1%' OR "reports"."address" LIKE 't1%')));