CREATE TYPE "public"."deposit_address_type" AS ENUM('transparent_p2pkh', 'transparent_p2sh', 'tex', 'unified', 'sapling');--> statement-breakpoint
CREATE TYPE "public"."deposit_result" AS ENUM('credited', 'not_credited_24h', 'held_for_review', 'wallet_refused');--> statement-breakpoint
CREATE TYPE "public"."deposit_source" AS ENUM('ironwood', 'orchard', 'sapling', 'via_tex_ironwood', 'via_tex_orchard', 'via_tex_sapling');--> statement-breakpoint
CREATE TYPE "public"."deposit_status" AS ENUM('awaiting_tx', 'verifying', 'onchain_ok', 'reported', 'published', 'refused', 'expired', 'wallet_refused');--> statement-breakpoint
CREATE TABLE "deposit_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"network" text NOT NULL,
	"status" "deposit_status" DEFAULT 'awaiting_tx' NOT NULL,
	"address_type" "deposit_address_type" NOT NULL,
	"ua_receivers" text[],
	"address_hmac" text NOT NULL,
	"check_amount_zat" bigint,
	"wallet" text NOT NULL,
	"txid" text,
	"txid_hmac" text,
	"height" integer,
	"after_nu7" boolean,
	"block_time" timestamp with time zone,
	"source" "deposit_source",
	"result" "deposit_result",
	"credited_at" timestamp with time zone,
	"confirmations_shown" integer,
	"evidence_url" text,
	"refused_reason" text,
	"tester_token_hash" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deposit_checks_txid_hmac_unique" UNIQUE("txid_hmac"),
	CONSTRAINT "deposit_checks_network_valid" CHECK ("deposit_checks"."network" IN ('mainnet', 'testnet')),
	CONSTRAINT "deposit_checks_wallet_len" CHECK (char_length("deposit_checks"."wallet") BETWEEN 1 AND 80),
	CONSTRAINT "deposit_checks_published_is_clean" CHECK ("deposit_checks"."status" <> 'published' OR ("deposit_checks"."reviewed_by" IS NOT NULL AND "deposit_checks"."reviewed_at" IS NOT NULL AND "deposit_checks"."txid" IS NULL AND "deposit_checks"."check_amount_zat" IS NULL AND "deposit_checks"."height" IS NULL AND "deposit_checks"."evidence_url" IS NULL)),
	CONSTRAINT "deposit_checks_credited_time" CHECK ("deposit_checks"."result" IS DISTINCT FROM 'credited' OR ("deposit_checks"."credited_at" IS NOT NULL AND ("deposit_checks"."block_time" IS NULL OR "deposit_checks"."credited_at" >= "deposit_checks"."block_time" - interval '5 minutes'))),
	CONSTRAINT "deposit_checks_has_tx" CHECK ("deposit_checks"."status" IN ('awaiting_tx', 'expired', 'wallet_refused') OR "deposit_checks"."result" = 'wallet_refused' OR "deposit_checks"."txid_hmac" IS NOT NULL),
	CONSTRAINT "deposit_checks_wallet_refused" CHECK ("deposit_checks"."status" <> 'wallet_refused' OR "deposit_checks"."result" = 'wallet_refused'),
	CONSTRAINT "deposit_checks_refused_reason" CHECK ("deposit_checks"."status" <> 'refused' OR "deposit_checks"."refused_reason" IS NOT NULL),
	CONSTRAINT "deposit_checks_amount_positive" CHECK ("deposit_checks"."check_amount_zat" IS NULL OR "deposit_checks"."check_amount_zat" > 0)
);
--> statement-breakpoint
ALTER TABLE "deposit_checks" ADD CONSTRAINT "deposit_checks_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deposit_checks_service_idx" ON "deposit_checks" USING btree ("network","service_id");--> statement-breakpoint
CREATE INDEX "deposit_checks_status_idx" ON "deposit_checks" USING btree ("network","status");