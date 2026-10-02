ALTER TABLE "reports" DROP CONSTRAINT "reports_listing_has_source";--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "source_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_listing_has_source" CHECK ("reports"."tier" <> 'listing' OR ("reports"."source_url" IS NOT NULL AND "reports"."source_read_at" IS NOT NULL));