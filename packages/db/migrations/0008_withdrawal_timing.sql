ALTER TABLE "tests" ADD COLUMN "requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN "requested_evidence_url" text;--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN "block_time" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN "tester_token_hash" text;