CREATE TYPE "public"."copy_condition" AS ENUM('new', 'good', 'fair', 'poor', 'damaged');--> statement-breakpoint
CREATE TYPE "public"."copy_status" AS ENUM('active', 'lost', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."fine_reason" AS ENUM('overdue', 'lost', 'damaged');--> statement-breakpoint
CREATE TYPE "public"."fine_status" AS ENUM('open', 'paid', 'waived');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('due_soon', 'overdue', 'hold_ready', 'fine');--> statement-breakpoint
CREATE TABLE "copies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"book_id" uuid NOT NULL,
	"barcode" text NOT NULL,
	"condition" "copy_condition" DEFAULT 'good' NOT NULL,
	"status" "copy_status" DEFAULT 'active' NOT NULL,
	"note" text,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "copies_barcode_unique" UNIQUE("barcode")
);
--> statement-breakpoint
CREATE TABLE "fines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"loan_id" uuid,
	"amount_cents" integer NOT NULL,
	"reason" "fine_reason" NOT NULL,
	"status" "fine_status" DEFAULT 'open' NOT NULL,
	"note" text,
	"resolved_at" timestamp with time zone,
	"resolved_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "libraries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"code" text NOT NULL,
	"tagline" text,
	"loan_days" integer DEFAULT 14 NOT NULL,
	"max_loans" integer DEFAULT 5 NOT NULL,
	"max_renewals" integer DEFAULT 2 NOT NULL,
	"hold_pickup_days" integer DEFAULT 3 NOT NULL,
	"fine_per_day_cents" integer DEFAULT 25 NOT NULL,
	"fine_grace_days" integer DEFAULT 0 NOT NULL,
	"max_fine_cents" integer DEFAULT 1000 NOT NULL,
	"lost_item_fee_cents" integer DEFAULT 2000 NOT NULL,
	"block_at_cents" integer DEFAULT 500 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "libraries_slug_unique" UNIQUE("slug"),
	CONSTRAINT "libraries_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"library_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"href" text,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
-- Hand-edited: new required columns are added as nullable, backfilled from the existing
-- single-library data, and only then made NOT NULL, so this runs safely on a live database.
ALTER TABLE "activity" ADD COLUMN "library_id" uuid;--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "library_id" uuid;--> statement-breakpoint
ALTER TABLE "holds" ADD COLUMN "library_id" uuid;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "library_id" uuid;--> statement-breakpoint
ALTER TABLE "loans" ADD COLUMN "copy_id" uuid;--> statement-breakpoint
-- Existing data becomes the first library (skipped on an empty database).
INSERT INTO "libraries" ("name", "slug", "code", "tagline")
SELECT 'Folio Central Library', 'central', 'CEN', 'The main branch, downtown'
WHERE EXISTS (SELECT 1 FROM "books") OR EXISTS (SELECT 1 FROM "users");--> statement-breakpoint
-- Each user keeps their global role as their role in that library.
INSERT INTO "memberships" ("library_id", "user_id", "role", "created_at")
SELECT l."id", u."id", u."role", u."created_at"
FROM "users" u CROSS JOIN "libraries" l
WHERE l."slug" = 'central';--> statement-breakpoint
UPDATE "books" SET "library_id" = (SELECT "id" FROM "libraries" WHERE "slug" = 'central');--> statement-breakpoint
UPDATE "holds" SET "library_id" = (SELECT "id" FROM "libraries" WHERE "slug" = 'central');--> statement-breakpoint
UPDATE "activity" SET "library_id" = (SELECT "id" FROM "libraries" WHERE "slug" = 'central');--> statement-breakpoint
UPDATE "loans" SET "library_id" = (SELECT "id" FROM "libraries" WHERE "slug" = 'central');--> statement-breakpoint
-- One physical copy per counted copy, with sequential barcodes (CEN-00001, ...).
INSERT INTO "copies" ("book_id", "barcode", "acquired_at")
SELECT b."id",
       'CEN-' || lpad((row_number() OVER (ORDER BY b."created_at", b."id", s.n))::text, 5, '0'),
       b."created_at"
FROM "books" b
CROSS JOIN LATERAL generate_series(1, greatest(b."total_copies", 1)) AS s(n);--> statement-breakpoint
-- Attach every loan to a copy. Open loans of the same book get distinct copies;
-- returned loans are spread over the copies in order.
WITH numbered_copies AS (
  SELECT "id", "book_id",
         row_number() OVER (PARTITION BY "book_id" ORDER BY "barcode") - 1 AS idx,
         count(*) OVER (PARTITION BY "book_id") AS n
  FROM "copies"
), numbered_loans AS (
  SELECT "id", "book_id",
         row_number() OVER (PARTITION BY "book_id", ("returned_at" IS NULL) ORDER BY "borrowed_at", "id") - 1 AS idx
  FROM "loans"
)
UPDATE "loans" AS l
SET "copy_id" = c."id"
FROM numbered_loans nl
JOIN numbered_copies c ON c."book_id" = nl."book_id" AND c.idx = nl.idx % c.n
WHERE l."id" = nl."id";--> statement-breakpoint
ALTER TABLE "activity" ALTER COLUMN "library_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "books" ALTER COLUMN "library_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "holds" ALTER COLUMN "library_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "loans" ALTER COLUMN "library_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "loans" ALTER COLUMN "copy_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "copies" ADD CONSTRAINT "copies_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fines" ADD CONSTRAINT "fines_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fines" ADD CONSTRAINT "fines_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fines" ADD CONSTRAINT "fines_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fines" ADD CONSTRAINT "fines_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "copies_book_idx" ON "copies" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "fines_library_status_idx" ON "fines" USING btree ("library_id","status");--> statement-breakpoint
CREATE INDEX "fines_user_idx" ON "fines" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_library_user_idx" ON "memberships" USING btree ("library_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_library_id_libraries_id_fk" FOREIGN KEY ("library_id") REFERENCES "public"."libraries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_copy_id_copies_id_fk" FOREIGN KEY ("copy_id") REFERENCES "public"."copies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_library_idx" ON "activity" USING btree ("library_id");--> statement-breakpoint
CREATE INDEX "books_library_idx" ON "books" USING btree ("library_id");--> statement-breakpoint
CREATE INDEX "holds_library_idx" ON "holds" USING btree ("library_id");--> statement-breakpoint
CREATE INDEX "loans_library_idx" ON "loans" USING btree ("library_id");--> statement-breakpoint
CREATE INDEX "loans_copy_idx" ON "loans" USING btree ("copy_id");