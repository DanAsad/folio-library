import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
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
  await db.execute(sql`truncate activity, reviews, holds, loans, books, users restart identity cascade`);
}

let counter = 0;

export async function makeUser(db: DB, role: schema.Role = "member", name?: string) {
  counter++;
  const [user] = await db
    .insert(schema.users)
    .values({ email: `user${counter}@test.local`, name: name ?? `User ${counter}`, role })
    .returning();
  return user;
}

export async function makeBook(db: DB, copies = 1, title?: string) {
  counter++;
  const [book] = await db
    .insert(schema.books)
    .values({ title: title ?? `Book ${counter}`, author: "Test Author", totalCopies: copies })
    .returning();
  return book;
}

/** Inserts a loan directly, e.g. one that is already overdue. `dueInDays` may be negative. */
export async function makeLoan(db: DB, bookId: string, userId: string, dueInDays = 14) {
  const now = Date.now();
  const [loan] = await db
    .insert(schema.loans)
    .values({ bookId, userId, borrowedAt: new Date(now - DAY), dueAt: new Date(now + dueInDays * DAY) })
    .returning();
  return loan;
}

/** Inserts a waiting hold with an explicit timestamp so queue order is deterministic. */
export async function makeHold(db: DB, bookId: string, userId: string, minutesAgo: number) {
  const [hold] = await db
    .insert(schema.holds)
    .values({ bookId, userId, createdAt: new Date(Date.now() - minutesAgo * 60_000) })
    .returning();
  return hold;
}

export { DAY };
