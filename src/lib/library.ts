import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { getDb, type DB } from "@/lib/db/client";
import { activity, books, holds, loans, reviews, users } from "@/lib/db/schema";

export const LOAN_DAYS = 14;
export const MAX_ACTIVE_LOANS = 5;
export const MAX_RENEWALS = 2;
export const HOLD_PICKUP_DAYS = 3;
const DAY = 24 * 60 * 60 * 1000;

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Executor = DB | Tx;

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

// Correlated subqueries. Identifiers are written out in full on purpose: in single-table
// queries Drizzle renders columns unqualified, so `${books.id}` inside a subquery over
// `loans` would silently resolve to `loans.id`.
export const activeLoansSql = sql<number>`(select count(*)::int from loans l where l.book_id = "books"."id" and l.returned_at is null)`;
const readyHoldsSql = sql<number>`(select count(*)::int from holds h where h.book_id = "books"."id" and h.status = 'ready')`;
const waitingHoldsSql = sql<number>`(select count(*)::int from holds h where h.book_id = "books"."id" and h.status = 'waiting')`;
const avgRatingSql = sql<number | null>`(select round(avg(r.rating)::numeric, 1)::float from reviews r where r.book_id = "books"."id")`;
const reviewCountSql = sql<number>`(select count(*)::int from reviews r where r.book_id = "books"."id")`;
const loanCountSql = sql<number>`(select count(*)::int from loans l where l.book_id = "books"."id")`;

export const bookListColumns = {
  id: books.id,
  title: books.title,
  author: books.author,
  isbn: books.isbn,
  genre: books.genre,
  tags: books.tags,
  publishedYear: books.publishedYear,
  publisher: books.publisher,
  pages: books.pages,
  language: books.language,
  coverUrl: books.coverUrl,
  location: books.location,
  totalCopies: books.totalCopies,
  createdAt: books.createdAt,
  activeLoans: activeLoansSql,
  readyHolds: readyHoldsSql,
  waitingHolds: waitingHoldsSql,
  avgRating: avgRatingSql,
  reviewCount: reviewCountSql,
  loanCount: loanCountSql,
};

export type BookListItem = {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  genre: string | null;
  tags: string[];
  publishedYear: number | null;
  publisher: string | null;
  pages: number | null;
  language: string;
  coverUrl: string | null;
  location: string | null;
  totalCopies: number;
  createdAt: Date;
  activeLoans: number;
  readyHolds: number;
  waitingHolds: number;
  avgRating: number | null;
  reviewCount: number;
  loanCount: number;
  available: number;
};

function withAvailability<T extends { totalCopies: number; activeLoans: number; readyHolds: number }>(b: T) {
  return { ...b, available: Math.max(0, b.totalCopies - b.activeLoans - b.readyHolds) };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const SEARCH_FIELDS = ["all", "title", "author", "isbn", "genre", "tags", "publisher"] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];
export const SORTS = ["relevance", "title", "author", "newest", "year", "popular", "rating"] as const;
export type Sort = (typeof SORTS)[number];

export type BookSearch = {
  q?: string;
  field?: SearchField;
  genre?: string;
  availableOnly?: boolean;
  yearFrom?: number;
  yearTo?: number;
  sort?: Sort;
  limit?: number;
};

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

export async function searchBooks(params: BookSearch): Promise<BookListItem[]> {
  const db = await getDb();
  const where: SQL[] = [];
  const q = params.q?.trim();
  const field = params.field ?? "all";

  if (q) {
    // Every word must match somewhere, so "le guin earthsea" finds the right book.
    const terms = field === "isbn" ? [q.replace(/[-\s]/g, "")] : q.split(/\s+/).filter(Boolean).slice(0, 8);
    for (const term of terms) {
      const p = `%${escapeLike(term)}%`;
      const tagMatch = sql`array_to_string(${books.tags}, ' ') ilike ${p}`;
      const byField: Record<SearchField, SQL | undefined> = {
        title: ilike(books.title, p),
        author: ilike(books.author, p),
        isbn: ilike(books.isbn, p),
        genre: ilike(books.genre, p),
        tags: tagMatch,
        publisher: ilike(books.publisher, p),
        all: or(
          ilike(books.title, p),
          ilike(books.author, p),
          ilike(books.isbn, p),
          ilike(books.genre, p),
          ilike(books.publisher, p),
          ilike(books.description, p),
          tagMatch,
        ),
      };
      where.push(byField[field]!);
    }
  }
  if (params.genre) where.push(eq(books.genre, params.genre));
  if (params.yearFrom) where.push(sql`${books.publishedYear} >= ${params.yearFrom}`);
  if (params.yearTo) where.push(sql`${books.publishedYear} <= ${params.yearTo}`);
  if (params.availableOnly) where.push(sql`${books.totalCopies} - ${activeLoansSql} - ${readyHoldsSql} > 0`);

  const sort = params.sort ?? (q ? "relevance" : "title");
  const orderBy: SQL[] = [];
  switch (sort) {
    case "relevance":
      if (q) {
        const starts = `${escapeLike(q)}%`;
        const contains = `%${escapeLike(q)}%`;
        orderBy.push(
          sql`case when ${books.title} ilike ${starts} then 0 when ${books.title} ilike ${contains} then 1 when ${books.author} ilike ${contains} then 2 else 3 end`,
        );
      }
      orderBy.push(asc(books.title));
      break;
    case "author":
      orderBy.push(asc(books.author), asc(books.title));
      break;
    case "newest":
      orderBy.push(desc(books.createdAt));
      break;
    case "year":
      orderBy.push(sql`${books.publishedYear} desc nulls last`);
      break;
    case "popular":
      orderBy.push(desc(loanCountSql), asc(books.title));
      break;
    case "rating":
      orderBy.push(sql`${avgRatingSql} desc nulls last`, asc(books.title));
      break;
    default:
      orderBy.push(asc(books.title));
  }

  const rows = await db
    .select(bookListColumns)
    .from(books)
    .where(where.length ? and(...where) : undefined)
    .orderBy(...orderBy)
    .limit(params.limit ?? 200);
  return rows.map(withAvailability);
}

export async function getGenres(): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .selectDistinct({ genre: books.genre })
    .from(books)
    .where(sql`${books.genre} is not null`)
    .orderBy(asc(books.genre));
  return rows.map((r) => r.genre!).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Book detail
// ---------------------------------------------------------------------------

export async function getBook(id: string) {
  const db = await getDb();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  await processHoldQueue(db, id);
  const [row] = await db
    .select({ ...bookListColumns, description: books.description, updatedAt: books.updatedAt })
    .from(books)
    .where(eq(books.id, id));
  if (!row) return null;

  const [activeLoans, queue, bookReviews, history] = await Promise.all([
    db.query.loans.findMany({
      where: and(eq(loans.bookId, id), isNull(loans.returnedAt)),
      with: { user: { columns: { id: true, name: true, email: true } } },
      orderBy: asc(loans.dueAt),
    }),
    db.query.holds.findMany({
      where: and(eq(holds.bookId, id), inArray(holds.status, ["waiting", "ready"])),
      with: { user: { columns: { id: true, name: true, email: true } } },
      orderBy: [sql`case when ${holds.status} = 'ready' then 0 else 1 end`, asc(holds.createdAt)],
    }),
    db.query.reviews.findMany({
      where: eq(reviews.bookId, id),
      with: { user: { columns: { id: true, name: true } } },
      orderBy: desc(reviews.createdAt),
    }),
    db.query.loans.findMany({
      where: eq(loans.bookId, id),
      with: { user: { columns: { id: true, name: true } } },
      orderBy: desc(loans.borrowedAt),
      limit: 15,
    }),
  ]);

  return { book: withAvailability(row), activeLoans, queue, reviews: bookReviews, history };
}

export async function getSimilarBooks(book: { id: string; genre: string | null; author: string; tags: string[] }) {
  const db = await getDb();
  const tagOverlap = book.tags.length
    ? sql`cardinality(array(select unnest(${books.tags}) intersect select unnest(ARRAY[${sql.join(
        book.tags.map((t) => sql`${t}`),
        sql`, `,
      )}]::text[])))`
    : sql`0`;
  const score = sql<number>`(case when ${books.author} = ${book.author} then 3 else 0 end) + (case when ${books.genre} = ${book.genre} then 2 else 0 end) + ${tagOverlap}`;
  const rows = await db
    .select({ ...bookListColumns, score })
    .from(books)
    .where(and(sql`${books.id} <> ${book.id}`, sql`${score} > 0`))
    .orderBy(desc(score), desc(loanCountSql))
    .limit(6);
  return rows.map(withAvailability);
}

// ---------------------------------------------------------------------------
// Holds queue
// ---------------------------------------------------------------------------

/**
 * Expires reservations that were not picked up in time and promotes the next
 * people in line while copies are free. Safe to call any time.
 */
export async function processHoldQueue(db: Executor, bookId: string) {
  const now = new Date();
  await db
    .update(holds)
    .set({ status: "expired" })
    .where(and(eq(holds.bookId, bookId), eq(holds.status, "ready"), lt(holds.expiresAt, now)));

  const [book] = await db
    .select({ totalCopies: books.totalCopies, activeLoans: activeLoansSql, readyHolds: readyHoldsSql, title: books.title })
    .from(books)
    .where(eq(books.id, bookId));
  if (!book) return;
  let free = book.totalCopies - book.activeLoans - book.readyHolds;
  if (free <= 0) return;

  const waiting = await db.query.holds.findMany({
    where: and(eq(holds.bookId, bookId), eq(holds.status, "waiting")),
    orderBy: asc(holds.createdAt),
    with: { user: { columns: { name: true, email: true } } },
    limit: free,
  });
  for (const h of waiting) {
    if (free <= 0) break;
    await db
      .update(holds)
      .set({ status: "ready", readyAt: now, expiresAt: new Date(now.getTime() + HOLD_PICKUP_DAYS * DAY) })
      .where(eq(holds.id, h.id));
    await db.insert(activity).values({
      action: "hold.ready",
      bookId,
      subjectUserId: h.userId,
      message: `“${book.title}” is now reserved for ${h.user.name ?? h.user.email}`,
    });
    free--;
  }
}

// ---------------------------------------------------------------------------
// Loans
// ---------------------------------------------------------------------------

export class LibraryError extends Error {}

async function lockBook(tx: Tx, bookId: string) {
  const res = await tx.execute(sql`select id, title from books where id = ${bookId} for update`);
  const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as { id: string; title: string }[];
  if (!rows.length) throw new LibraryError("That book no longer exists.");
  return rows[0];
}

export async function borrowBook({ bookId, userId, actorId }: { bookId: string; userId: string; actorId: string }) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const book = await lockBook(tx, bookId);
    await processHoldQueue(tx, bookId);

    const member = await tx.query.users.findFirst({ where: eq(users.id, userId) });
    if (!member) throw new LibraryError("Member not found.");

    const active = await tx.query.loans.findMany({ where: and(eq(loans.userId, userId), isNull(loans.returnedAt)) });
    if (active.some((l) => l.bookId === bookId)) throw new LibraryError(`${member.name ?? "This member"} already has this book.`);
    if (active.length >= MAX_ACTIVE_LOANS) throw new LibraryError(`Loan limit reached (${MAX_ACTIVE_LOANS} books at a time).`);
    const overdue = active.filter((l) => l.dueAt < new Date());
    if (overdue.length) throw new LibraryError("Please return overdue books before borrowing more.");

    const [counts] = await tx
      .select({ totalCopies: books.totalCopies, activeLoans: activeLoansSql })
      .from(books)
      .where(eq(books.id, bookId));
    const readyHolds = await tx.query.holds.findMany({ where: and(eq(holds.bookId, bookId), eq(holds.status, "ready")) });
    const myReady = readyHolds.find((h) => h.userId === userId);
    const reservedForOthers = readyHolds.length - (myReady ? 1 : 0);
    const free = counts.totalCopies - counts.activeLoans - reservedForOthers;
    if (free <= 0) {
      throw new LibraryError(
        reservedForOthers > 0 ? "The remaining copies are reserved for members on the waitlist." : "No copies available right now. Join the waitlist instead.",
      );
    }

    if (myReady) await tx.update(holds).set({ status: "fulfilled" }).where(eq(holds.id, myReady.id));
    // A member borrowing directly leaves the queue.
    await tx
      .update(holds)
      .set({ status: "fulfilled" })
      .where(and(eq(holds.bookId, bookId), eq(holds.userId, userId), eq(holds.status, "waiting")));

    const now = new Date();
    const [loan] = await tx
      .insert(loans)
      .values({
        bookId,
        userId,
        issuedById: actorId !== userId ? actorId : null,
        borrowedAt: now,
        dueAt: new Date(now.getTime() + LOAN_DAYS * DAY),
      })
      .returning();
    await tx.insert(activity).values({
      actorId,
      action: "loan.borrow",
      bookId,
      subjectUserId: userId,
      message:
        actorId === userId
          ? `${member.name ?? member.email} borrowed “${book.title}”`
          : `“${book.title}” checked out to ${member.name ?? member.email}`,
    });
    return { loan, title: book.title, memberName: member.name ?? member.email };
  });
}

export async function returnLoan({ loanId, actorId, isStaff }: { loanId: string; actorId: string; isStaff: boolean }) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const loan = await tx.query.loans.findFirst({ where: eq(loans.id, loanId), with: { user: true } });
    if (!loan) throw new LibraryError("Loan not found.");
    if (loan.returnedAt) throw new LibraryError("This book was already returned.");
    if (!isStaff && loan.userId !== actorId) throw new LibraryError("You can only return your own books.");
    const book = await lockBook(tx, loan.bookId);

    await tx.update(loans).set({ returnedAt: new Date() }).where(eq(loans.id, loanId));
    const late = loan.dueAt < new Date();
    await tx.insert(activity).values({
      actorId,
      action: "loan.return",
      bookId: loan.bookId,
      subjectUserId: loan.userId,
      message: `${loan.user.name ?? loan.user.email} returned “${book.title}”${late ? " (late)" : ""}`,
    });
    await processHoldQueue(tx, loan.bookId);
    return { title: book.title, late };
  });
}

export async function renewLoan({ loanId, actorId, isStaff }: { loanId: string; actorId: string; isStaff: boolean }) {
  const db = await getDb();
  const loan = await db.query.loans.findFirst({ where: eq(loans.id, loanId), with: { book: true } });
  if (!loan || loan.returnedAt) throw new LibraryError("Loan not found.");
  if (!isStaff && loan.userId !== actorId) throw new LibraryError("You can only renew your own books.");
  if (loan.renewals >= MAX_RENEWALS) throw new LibraryError(`This loan has already been renewed ${MAX_RENEWALS} times.`);
  const waiting = await db.query.holds.findFirst({
    where: and(eq(holds.bookId, loan.bookId), eq(holds.status, "waiting")),
  });
  if (waiting) throw new LibraryError("Someone is waiting for this book, so it can't be renewed.");

  const base = Math.max(loan.dueAt.getTime(), Date.now());
  const dueAt = new Date(base + LOAN_DAYS * DAY);
  await db.update(loans).set({ dueAt, renewals: loan.renewals + 1 }).where(eq(loans.id, loanId));
  await db.insert(activity).values({
    actorId,
    action: "loan.renew",
    bookId: loan.bookId,
    subjectUserId: loan.userId,
    message: `Loan of “${loan.book.title}” renewed until ${dueAt.toDateString()}`,
  });
  return { dueAt, title: loan.book.title };
}

export async function placeHold({ bookId, userId }: { bookId: string; userId: string }) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const book = await lockBook(tx, bookId);
    const existing = await tx.query.holds.findFirst({
      where: and(eq(holds.bookId, bookId), eq(holds.userId, userId), inArray(holds.status, ["waiting", "ready"])),
    });
    if (existing) throw new LibraryError("You're already on the waitlist for this book.");
    const hasIt = await tx.query.loans.findFirst({
      where: and(eq(loans.bookId, bookId), eq(loans.userId, userId), isNull(loans.returnedAt)),
    });
    if (hasIt) throw new LibraryError("You already have this book.");

    const [hold] = await tx.insert(holds).values({ bookId, userId }).returning();
    const member = await tx.query.users.findFirst({ where: eq(users.id, userId) });
    await tx.insert(activity).values({
      actorId: userId,
      action: "hold.place",
      bookId,
      subjectUserId: userId,
      message: `${member?.name ?? "A member"} joined the waitlist for “${book.title}”`,
    });
    await processHoldQueue(tx, bookId);
    const position = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(holds)
      .where(and(eq(holds.bookId, bookId), eq(holds.status, "waiting"), sql`${holds.createdAt} <= ${hold.createdAt}`));
    return { title: book.title, position: position[0].n };
  });
}

export async function cancelHold({ holdId, actorId, isStaff }: { holdId: string; actorId: string; isStaff: boolean }) {
  const db = await getDb();
  const hold = await db.query.holds.findFirst({ where: eq(holds.id, holdId), with: { book: true } });
  if (!hold || !["waiting", "ready"].includes(hold.status)) throw new LibraryError("Hold not found.");
  if (!isStaff && hold.userId !== actorId) throw new LibraryError("You can only cancel your own holds.");
  await db.update(holds).set({ status: "cancelled" }).where(eq(holds.id, holdId));
  await processHoldQueue(db, hold.bookId);
  return { title: hold.book.title };
}

export async function logActivity(entry: typeof activity.$inferInsert) {
  const db = await getDb();
  await db.insert(activity).values(entry);
}
