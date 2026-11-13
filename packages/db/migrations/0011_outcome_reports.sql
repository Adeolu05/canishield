CREATE TYPE "public"."amount_band" AS ENUM('under_1', '1_to_10', '10_to_100', 'over_100', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."outcome_result" AS ENUM('credited', 'held_then_credited', 'documents_requested', 'rejected', 'refunded', 'held_open');--> statement-breakpoint
CREATE TYPE "public"."outcome_route" AS ENUM('direct_shielded', 'via_tex', 'via_transparent', 'swap', 'unknown');--> statement-breakpoint
CREATE TABLE "outcome_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"network" text NOT NULL,
	"result" "outcome_result" NOT NULL,
	"amount_band" "amount_band" NOT NULL,
	"route" "outcome_route" DEFAULT 'unknown' NOT NULL,
	"week_of" date NOT NULL,
	"days_held" integer,
	"credit_minutes" integer,
	"source_url" text,
	"evidence_url" text,
	"note" text,
	"status" "report_status" DEFAULT 'unreviewed' NOT NULL,
	"reporter_token_hash" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outcome_reports_network_valid" CHECK ("outcome_reports"."network" IN ('mainnet', 'testnet')),
	CONSTRAINT "outcome_reports_week_is_monday" CHECK (extract(isodow from "outcome_reports"."week_of") = 1),
	CONSTRAINT "outcome_reports_days_held_range" CHECK ("outcome_reports"."days_held" IS NULL OR "outcome_reports"."days_held" BETWEEN 0 AND 3650),
	CONSTRAINT "outcome_reports_days_held_when_held" CHECK (("outcome_reports"."result" IN ('held_then_credited', 'held_open')) = ("outcome_reports"."days_held" IS NOT NULL)),
	CONSTRAINT "outcome_reports_credit_minutes" CHECK ("outcome_reports"."credit_minutes" IS NULL OR ("outcome_reports"."result" = 'credited' AND "outcome_reports"."credit_minutes" BETWEEN 0 AND 43200 AND "outcome_reports"."credit_minutes" % 5 = 0)),
	CONSTRAINT "outcome_reports_evidence_https" CHECK ("outcome_reports"."evidence_url" IS NULL OR ("outcome_reports"."evidence_url" LIKE 'https://%' AND char_length("outcome_reports"."evidence_url") <= 500)),
	CONSTRAINT "outcome_reports_note_len" CHECK ("outcome_reports"."note" IS NULL OR char_length("outcome_reports"."note") BETWEEN 1 AND 280),
	CONSTRAINT "outcome_reports_source_https" CHECK ("outcome_reports"."source_url" IS NULL OR ("outcome_reports"."source_url" LIKE 'https://%' AND char_length("outcome_reports"."source_url") <= 500)),
	CONSTRAINT "outcome_reports_reviewed" CHECK ("outcome_reports"."status" = 'unreviewed' OR ("outcome_reports"."reviewed_by" IS NOT NULL AND "outcome_reports"."reviewed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "outcome_reports" ADD CONSTRAINT "outcome_reports_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outcome_reports_service_idx" ON "outcome_reports" USING btree ("network","service_id","status");--> statement-breakpoint
CREATE INDEX "outcome_reports_status_idx" ON "outcome_reports" USING btree ("network","status");