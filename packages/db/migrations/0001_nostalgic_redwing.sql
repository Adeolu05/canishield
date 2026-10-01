CREATE TYPE "public"."report_tier" AS ENUM('community', 'listing');--> statement-breakpoint
ALTER TYPE "public"."report_outcome" ADD VALUE 'form_accepted';--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "tier" "report_tier" DEFAULT 'community' NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "test_id" uuid;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_test_id_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_listing_has_source" CHECK ("reports"."tier" <> 'listing' OR "reports"."source_url" IS NOT NULL);