ALTER TABLE "reports" ADD COLUMN "reviewed_by" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_review_recorded" CHECK ("reports"."tier" <> 'community' OR "reports"."status" = 'unreviewed' OR ("reports"."reviewed_by" IS NOT NULL AND "reports"."reviewed_at" IS NOT NULL));