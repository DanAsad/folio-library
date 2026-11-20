ALTER TABLE "activity" ADD COLUMN "i18n" jsonb;--> statement-breakpoint
ALTER TABLE "fines" ADD COLUMN "payment_ref" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "i18n" jsonb;