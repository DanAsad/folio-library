import "server-only";
import { and, asc, desc, eq, isNull, min, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { books, libraries, loans, reviews } from "@/lib/db/schema";
import { bookListColumns, getSimilarBooks, withAvailability } from "@/lib/library";

/**
 * Read-only queries for the public catalogue (no sign-in). They select only catalogue data and
 * counts: never member names, emails, loans or barcodes. Unlike the signed-in pages they also
 * never write (no hold-queue processing), so anonymous visitors can't change anything.
 */

export type PublicLibrary = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  loanDays: number;
  maxRenewals: number;
};

const libraryColumns = {
  id: libraries.id,
  name: libraries.name,
  slug: libraries.slug,
  tagline: libraries.tagline,
  loanDays: libraries.loanDays,
  maxRenewals: libraries.maxRenewals,
};

export async function listPublicLibraries(): Promise<PublicLibrary[]> {
  const db = await getDb();
  return db.select(libraryColumns).from(libraries).orderBy(asc(libraries.createdAt));
}

/** The library a public page shows: the one named in the URL, else the first. */
export async function resolvePublicLibrary(slug: string | undefined) {
  const all = await listPublicLibraries();
  return { libraries: all, library: all.find((l) => l.slug === slug) ?? all[0] ?? null };
}

export async function getPublicBook(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = await getDb();
  const [row] = await db
    .select({ ...bookListColumns, description: books.description })
    .from(books)
    .where(eq(books.id, id));
  if (!row) return null;
  const book = withAvailability(row);

  const [[library], [{ nextDue }], recentReviews, similar] = await Promise.all([
    db.select(libraryColumns).from(libraries).where(eq(libraries.id, book.libraryId)),
    db
      .select({ nextDue: min(loans.dueAt) })
      .from(loans)
      .where(and(eq(loans.bookId, id), isNull(loans.returnedAt))),
    // Reviews are shown without names.
    db
      .select({ id: reviews.id, rating: reviews.rating, body: reviews.body, createdAt: reviews.createdAt })
      .from(reviews)
      .where(and(eq(reviews.bookId, id), sql`${reviews.body} is not null and ${reviews.body} <> ''`))
      .orderBy(desc(reviews.createdAt))
      .limit(6),
    getSimilarBooks(book),
  ]);

  return { book, library, nextDue: nextDue ?? null, reviews: recentReviews, similar };
}
