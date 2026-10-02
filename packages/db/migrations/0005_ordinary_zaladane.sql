CREATE TYPE "public"."research_claim" AS ENUM('ironwood_supported', 'shielded_supported', 'transparent_only', 'shielded_not_claimed', 'shielded_announced', 'no_longer_supported', 'no_current_release', 'listing_disputed');--> statement-breakpoint
ALTER TYPE "public"."service_kind" ADD VALUE 'hardware';--> statement-breakpoint
CREATE TABLE "research_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"network" text NOT NULL,
	"source" text NOT NULL,
	"claim" "research_claim" NOT NULL,
	"product" text NOT NULL,
	"detail" text,
	"official_url" text NOT NULL,
	"read_at" timestamp with time zone NOT NULL,
	"source_file" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_claims_one_per_source" UNIQUE("source","network","service_id"),
	CONSTRAINT "research_claims_network_valid" CHECK ("research_claims"."network" IN ('mainnet', 'testnet')),
	CONSTRAINT "research_claims_official_https" CHECK ("research_claims"."official_url" LIKE 'https://%')
);
--> statement-breakpoint
ALTER TABLE "research_claims" ADD CONSTRAINT "research_claims_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;