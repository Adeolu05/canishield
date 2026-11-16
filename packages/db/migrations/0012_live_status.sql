CREATE TABLE "funding_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"side" text NOT NULL,
	"from_state" text NOT NULL,
	"to_state" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	CONSTRAINT "funding_events_side" CHECK ("funding_events"."side" IN ('deposit', 'withdraw')),
	CONSTRAINT "funding_events_states" CHECK ("funding_events"."from_state" IN ('open', 'paused') AND "funding_events"."to_state" IN ('open', 'paused') AND "funding_events"."from_state" <> "funding_events"."to_state")
);
--> statement-breakpoint
CREATE TABLE "funding_status" (
	"service_id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"deposit" text DEFAULT 'unknown' NOT NULL,
	"withdraw" text DEFAULT 'unknown' NOT NULL,
	"seen_deposit" text DEFAULT 'unknown' NOT NULL,
	"seen_withdraw" text DEFAULT 'unknown' NOT NULL,
	"known_deposit" text,
	"known_withdraw" text,
	"confirmations" integer,
	"note" text,
	"last_ok_at" timestamp with time zone,
	"last_error" text,
	"checked_at" timestamp with time zone NOT NULL,
	"changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funding_status_states" CHECK ("funding_status"."deposit" IN ('open', 'paused', 'unknown') AND "funding_status"."withdraw" IN ('open', 'paused', 'unknown') AND "funding_status"."seen_deposit" IN ('open', 'paused', 'unknown') AND "funding_status"."seen_withdraw" IN ('open', 'paused', 'unknown')),
	CONSTRAINT "funding_status_known" CHECK (("funding_status"."known_deposit" IS NULL OR "funding_status"."known_deposit" IN ('open', 'paused')) AND ("funding_status"."known_withdraw" IS NULL OR "funding_status"."known_withdraw" IN ('open', 'paused'))),
	CONSTRAINT "funding_status_confirmations" CHECK ("funding_status"."confirmations" IS NULL OR "funding_status"."confirmations" BETWEEN 1 AND 10000),
	CONSTRAINT "funding_status_text_len" CHECK (char_length("funding_status"."source") BETWEEN 1 AND 80 AND ("funding_status"."note" IS NULL OR char_length("funding_status"."note") <= 80) AND ("funding_status"."last_error" IS NULL OR char_length("funding_status"."last_error") <= 120))
);
--> statement-breakpoint
ALTER TABLE "funding_events" ADD CONSTRAINT "funding_events_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funding_status" ADD CONSTRAINT "funding_status_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "funding_events_at_idx" ON "funding_events" USING btree ("at");