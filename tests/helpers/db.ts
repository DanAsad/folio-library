import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

const DAY = 24 * 60 * 60 * 1000;

/**
 * A real Postgres (PGlite) in memory, with the app's own migrations applied.
 * Tests run the actual SQL, transactions and row locks, not mocks.
 */
export async function createTestDb(): Promise<DB> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
  return db as unknown as DB;
}

export async function resetDb(db: DB) {
  await db.execute(sql`truncate libraries, users restart identity cascade`);
}

let counter = 0;

/** A library with the default rules unless overridden (14 days, 5 books, $0.25/day...). */
export async function makeLibrary(db: DB, rules: Partial<typeof schema.libraries.$inferInsert> = {}) {
  counter++;
  const [lib] = await db
    .insert(schema.libraries)
    .values({ name: `Library ${counter}`, slug: `lib-${counter}`, code: `L${String.fromCharCode(65 + (counter % 26))}${counter}`.slice(0, 5), ...rules })
    .returning();
  return lib;
}

export async function makeUser(db: DB, libraryId: string, role: schema.Role = "member", name?: string) {
  counter++;
  const [user] = await db
    .insert(schema.users)
    .values({ email: `user${counter}@test.local`, name: name ?? `User ${counter}` })
    .returning();
  await db.insert(schema.memberships).values({ libraryId, userId: user.id, role });
  return user;
}

export async function makeBook(db: DB, libraryId: string, copies = 1, title?: string) {
  counter++;
  const [book] = await db
    .insert(schema.books)
    .values({ libraryId, title: title ?? `Book ${counter}`, author: "Test Author" })
    .returning();
  const lib = await db.query.libraries.findFirst({ where: eq(schema.libraries.id, libraryId) });
  for (let i = 0; i < copies; i++) {
    counter++;
    await db.insert(schema.copies).values({ bookId: book.id, barcode: `${lib!.code}-T${counter}` });
  }
  return book;
}

/** Inserts an open loan on a free copy directly, e.g. one that is already overdue. `dueInDays` may be negative. */
export async function makeLoan(db: DB, libraryId: string, bookId: string, userId: string, dueInDays = 14) {
  const [copy] = await db
    .select({ id: schema.copies.id })
    .from(schema.copies)
    .where(
      and(
        eq(schema.copies.bookId, bookId),
        eq(schema.copies.status, "active"),
        sql`not exists (select 1 from loans l where l.copy_id = "copies"."id" and l.returned_at is null)`,
      ),
    )
    .limit(1);
  if (!copy) throw new Error("makeLoan: no free copy");
  const now = Date.now();
  const [loan] = await db
    .insert(schema.loans)
    .values({ libraryId, bookId, copyId: copy.id, userId, borrowedAt: new Date(now - 20 * DAY), dueAt: new Date(now + dueInDays * DAY) })
    .returning();
  return loan;
}

/** Inserts a waiting hold with an explicit timestamp so queue order is deterministic. */
export async function makeHold(db: DB, libraryId: string, bookId: string, userId: string, minutesAgo: number) {
  const [hold] = await db
    .insert(schema.holds)
    .values({ libraryId, bookId, userId, createdAt: new Date(Date.now() - minutesAgo * 60_000) })
    .returning();
  return hold;
}

export async function openLoans(db: DB, bookId: string) {
  return db.query.loans.findMany({ where: and(eq(schema.loans.bookId, bookId), isNull(schema.loans.returnedAt)) });
}

export { DAY };
