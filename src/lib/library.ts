import "server-only";
import { and, asc, desc, eq, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { getDb, type DB } from "@/lib/db/client";
import { activity, books, copies, fines, holds, libraries, loans, memberships, reviews, users, type CopyCondition, type Library } from "@/lib/db/schema";
import { formatMoney, overdueFineCents } from "@/lib/money";
import { notify } from "@/lib/reminders";

const DAY = 24 * 60 * 60 * 1000;

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Executor = DB | Tx;

export class LibraryError extends Error {}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

// Correlated subqueries. Identifiers are written out in full on purpose: in single-table
// queries Drizzle renders columns unqualified, so `${books.id}` inside a subquery over
// another table would silently compare that table's own id column.
export const totalCopiesSql = sql<number>`(select count(*)::int from copies c where c.book_id = "books"."id" and c.status = 'active')`;
export const activeLoansSql = sql<number>`(select count(*)::int from loans l where l.book_id = "books"."id" and l.returned_at is null)`;
const readyHoldsSql = sql<number>`(select count(*)::int from holds h where h.book_id = "books"."id" and h.status = 'ready')`;
const waitingHoldsSql = sql<number>`(select count(*)::int from holds h where h.book_id = "books"."id" and h.status = 'waiting')`;
const avgRatingSql = sql<number | null>`(select round(avg(r.rating)::numeric, 1)::float from reviews r where r.book_id = "books"."id")`;
const reviewCountSql = sql<number>`(select count(*)::int from reviews r where r.book_id = "books"."id")`;
export const loanCountSql = sql<number>`(select count(*)::int from loans l where l.book_id = "books"."id")`;

export const bookListColumns = {
  id: books.id,
  libraryId: books.libraryId,
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
  createdAt: books.createdAt,
  totalCopies: totalCopiesSql,
  activeLoans: activeLoansSql,
  readyHolds: readyHoldsSql,
  waitingHolds: waitingHoldsSql,
  avgRating: avgRatingSql,
  reviewCount: reviewCountSql,
  loanCount: loanCountSql,
};

export type BookListItem = {
  id: string;
  libraryId: string;
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
  createdAt: Date;
  totalCopies: number;
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

export async function getLibrary(db: Executor, libraryId: string): Promise<Library> {
  const [lib] = await db.select().from(libraries).where(eq(libraries.id, libraryId));
  if (!lib) throw new LibraryError("Library not found.");
  return lib;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const SEARCH_FIELDS = ["all", "title", "author", "isbn", "genre", "tags", "publisher"] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];
export const SORTS = ["relevance", "title", "author", "newest", "year", "popular", "rating"] as const;
export type Sort = (typeof SORTS)[number];

export type BookSearch = {
  libraryId: string;
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
  const where: SQL[] = [eq(books.libraryId, params.libraryId)];
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
          // A copy's barcode finds its book too.
          sql`exists (select 1 from copies c where c.book_id = "books"."id" and c.barcode ilike ${p})`,
        ),
      };
      where.push(byField[field]!);
    }
  }
  if (params.genre) where.push(eq(books.genre, params.genre));
  if (params.yearFrom) where.push(sql`${books.publishedYear} >= ${params.yearFrom}`);
  if (params.yearTo) where.push(sql`${books.publishedYear} <= ${params.yearTo}`);
  if (params.availableOnly) where.push(sql`${totalCopiesSql} - ${activeLoansSql} - ${readyHoldsSql} > 0`);

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
    .where(and(...where))
    .orderBy(...orderBy)
    .limit(params.limit ?? 200);
  return rows.map(withAvailability);
}

export async function getGenres(libraryId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .selectDistinct({ genre: books.genre })
    .from(books)
    .where(and(eq(books.libraryId, libraryId), sql`${books.genre} is not null`))
    .orderBy(asc(books.genre));
  return rows.map((r) => r.genre!).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Book detail
// ---------------------------------------------------------------------------

export async function getBook(libraryId: string, id: string) {
  const db = await getDb();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [owner] = await db.select({ libraryId: books.libraryId }).from(books).where(eq(books.id, id));
  // A book from another library is "not found": tenants never see each other's data.
  if (!owner || owner.libraryId !== libraryId) return null;
  await processHoldQueue(db, id);
  const [row] = await db
    .select({ ...bookListColumns, description: books.description, updatedAt: books.updatedAt })
    .from(books)
    .where(eq(books.id, id));

  const [activeLoans, queue, bookReviews, history, bookCopies] = await Promise.all([
    db.query.loans.findMany({
      where: and(eq(loans.bookId, id), isNull(loans.returnedAt)),
      with: { user: { columns: { id: true, name: true, email: true } }, copy: { columns: { barcode: true } } },
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
      with: { user: { columns: { id: true, name: true } }, copy: { columns: { barcode: true } } },
      orderBy: desc(loans.borrowedAt),
      limit: 15,
    }),
    db.query.copies.findMany({ where: eq(copies.bookId, id), orderBy: asc(copies.barcode) }),
  ]);

  const loanByCopy = new Map(activeLoans.map((l) => [l.copyId, l]));
  const copyList = bookCopies.map((c) => ({ ...c, loan: loanByCopy.get(c.id) ?? null }));
  return { book: withAvailability(row), activeLoans, queue, reviews: bookReviews, history, copies: copyList };
}

export async function getSimilarBooks(book: { id: string; libraryId: string; genre: string | null; author: string; tags: string[] }) {
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
    .where(and(eq(books.libraryId, book.libraryId), sql`${books.id} <> ${book.id}`, sql`${score} > 0`))
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
    .select({ totalCopies: totalCopiesSql, activeLoans: activeLoansSql, readyHolds: readyHoldsSql, title: books.title, libraryId: books.libraryId })
    .from(books)
    .where(eq(books.id, bookId));
  if (!book) return;
  let free = book.totalCopies - book.activeLoans - book.readyHolds;
  if (free <= 0) return;

  const lib = await getLibrary(db, book.libraryId);
  const waiting = await db.query.holds.findMany({
    where: and(eq(holds.bookId, bookId), eq(holds.status, "waiting")),
    orderBy: asc(holds.createdAt),
    with: { user: { columns: { name: true, email: true } } },
    limit: free,
  });
  for (const h of waiting) {
    if (free <= 0) break;
    const expiresAt = new Date(now.getTime() + lib.holdPickupDays * DAY);
    await db.update(holds).set({ status: "ready", readyAt: now, expiresAt }).where(eq(holds.id, h.id));
    await db.insert(activity).values({
      libraryId: lib.id,
      action: "hold.ready",
      bookId,
      subjectUserId: h.userId,
      message: `“${book.title}” is now reserved for ${h.user.name ?? h.user.email}`,
    });
    await notify(db, {
      userId: h.userId,
      libraryId: lib.id,
      kind: "hold_ready",
      title: `“${book.title}” is waiting for you`,
      body: `A copy is on the reserve shelf at ${lib.name} until ${expiresAt.toDateString()}.`,
      href: `/books/${bookId}`,
      dedupeKey: `hold_ready:${h.id}`,
    });
    free--;
  }
}

// ---------------------------------------------------------------------------
// Members, fines
// ---------------------------------------------------------------------------

async function membershipOf(db: Executor, libraryId: string, userId: string) {
  const [m] = await db
    .select({ role: memberships.role, name: users.name, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.libraryId, libraryId), eq(memberships.userId, userId)));
  return m ?? null;
}

/** Sum of a member's unpaid fines at one library, in cents. */
export async function getBalance(db: Executor, libraryId: string, userId: string) {
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${fines.amountCents}), 0)::int` })
    .from(fines)
    .where(and(eq(fines.libraryId, libraryId), eq(fines.userId, userId), eq(fines.status, "open")));
  return total;
}

async function chargeFine(
  db: Executor,
  lib: Library,
  f: { userId: string; loanId?: string | null; amountCents: number; reason: "overdue" | "lost" | "damaged"; note?: string | null; title: string },
) {
  if (f.amountCents <= 0) return null;
  const [fine] = await db
    .insert(fines)
    .values({ libraryId: lib.id, userId: f.userId, loanId: f.loanId ?? null, amountCents: f.amountCents, reason: f.reason, note: f.note ?? null })
    .returning();
  await notify(db, {
    userId: f.userId,
    libraryId: lib.id,
    kind: "fine",
    title: `${formatMoney(f.amountCents, lib.currency)} ${f.reason === "overdue" ? "late fee" : f.reason === "lost" ? "lost-item fee" : "damage fee"}`,
    body: `${f.title}. You can pay at the ${lib.name} desk.`,
    href: "/loans?view=mine",
    dedupeKey: `fine:${fine.id}`,
  });
  return fine;
}

// ---------------------------------------------------------------------------
// Loans
// ---------------------------------------------------------------------------

async function lockBook(tx: Executor, libraryId: string, bookId: string) {
  const res = await tx.execute(sql`select id, title, library_id from books where id = ${bookId} for update`);
  const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as { id: string; title: string; library_id: string }[];
  if (!rows.length || rows[0].library_id !== libraryId) throw new LibraryError("That book no longer exists.");
  return rows[0];
}

/**
 * Lends a copy. Pass `barcode` to lend a specific copy (scanned at the desk); otherwise the
 * first free copy is used. All the library's rules are checked inside one transaction that
 * locks the book row, so two people can never get the last copy.
 */
export async function borrowBook({
  libraryId,
  bookId,
  userId,
  actorId,
  barcode,
}: {
  libraryId: string;
  bookId: string;
  userId: string;
  actorId: string;
  barcode?: string;
}) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const book = await lockBook(tx, libraryId, bookId);
    const lib = await getLibrary(tx, libraryId);
    await processHoldQueue(tx, bookId);

    const member = await membershipOf(tx, libraryId, userId);
    if (!member) throw new LibraryError("That person isn't a member of this library.");
    const who = member.name ?? "This member";

    const active = await tx.query.loans.findMany({ where: and(eq(loans.libraryId, libraryId), eq(loans.userId, userId), isNull(loans.returnedAt)) });
    if (active.some((l) => l.bookId === bookId)) throw new LibraryError(`${who} already has this book.`);
    if (active.length >= lib.maxLoans) throw new LibraryError(`Loan limit reached (${lib.maxLoans} books at a time).`);
    if (active.some((l) => l.dueAt < new Date())) throw new LibraryError("Please return overdue books before borrowing more.");
    const owed = await getBalance(tx, libraryId, userId);
    if (lib.blockAtCents > 0 && owed >= lib.blockAtCents) {
      throw new LibraryError(`Unpaid fines of ${formatMoney(owed, lib.currency)} need to be settled at the desk before borrowing.`);
    }

    // Free copies: active and not currently on loan.
    const free = await tx
      .select({ id: copies.id, barcode: copies.barcode })
      .from(copies)
      .where(
        and(
          eq(copies.bookId, bookId),
          eq(copies.status, "active"),
          sql`not exists (select 1 from loans l where l.copy_id = "copies"."id" and l.returned_at is null)`,
        ),
      )
      .orderBy(asc(copies.barcode));
    const readyHolds = await tx.query.holds.findMany({ where: and(eq(holds.bookId, bookId), eq(holds.status, "ready")) });
    const myReady = readyHolds.find((h) => h.userId === userId);
    const reservedForOthers = readyHolds.length - (myReady ? 1 : 0);
    if (free.length - reservedForOthers <= 0) {
      throw new LibraryError(
        reservedForOthers > 0 && free.length > 0
          ? "The remaining copies are reserved for members on the waitlist."
          : "No copies available right now. Join the waitlist instead.",
      );
    }
    let copy = free[0];
    if (barcode) {
      const wanted = barcode.trim().toUpperCase();
      const match = free.find((c) => c.barcode.toUpperCase() === wanted);
      if (!match) throw new LibraryError(`Copy ${wanted} isn't available for this book.`);
      copy = match;
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
        libraryId,
        bookId,
        copyId: copy.id,
        userId,
        issuedById: actorId !== userId ? actorId : null,
        borrowedAt: now,
        dueAt: new Date(now.getTime() + lib.loanDays * DAY),
      })
      .returning();
    await tx.insert(activity).values({
      libraryId,
      actorId,
      action: "loan.borrow",
      bookId,
      subjectUserId: userId,
      message:
        actorId === userId
          ? `${member.name ?? member.email} borrowed “${book.title}” (${copy.barcode})`
          : `“${book.title}” (${copy.barcode}) checked out to ${member.name ?? member.email}`,
    });
    return { loan, barcode: copy.barcode, title: book.title, memberName: member.name ?? member.email };
  });
}

/**
 * Closes a loan. Late returns are charged by the library's fine rules; staff can record the
 * copy's condition at check-in.
 */
export async function returnLoan({
  libraryId,
  loanId,
  actorId,
  isStaff,
  condition,
}: {
  libraryId: string;
  loanId: string;
  actorId: string;
  isStaff: boolean;
  condition?: CopyCondition;
}) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const loan = await tx.query.loans.findFirst({ where: eq(loans.id, loanId), with: { user: true, copy: true } });
    if (!loan || loan.libraryId !== libraryId) throw new LibraryError("Loan not found.");
    if (loan.returnedAt) throw new LibraryError("This book was already returned.");
    if (!isStaff && loan.userId !== actorId) throw new LibraryError("You can only return your own books.");
    const book = await lockBook(tx, libraryId, loan.bookId);
    const lib = await getLibrary(tx, libraryId);

    const now = new Date();
    await tx.update(loans).set({ returnedAt: now }).where(eq(loans.id, loanId));
    if (isStaff && condition && condition !== loan.copy.condition) {
      await tx.update(copies).set({ condition }).where(eq(copies.id, loan.copyId));
    }
    const late = loan.dueAt < now;
    const fine = await chargeFine(tx, lib, {
      userId: loan.userId,
      loanId,
      amountCents: overdueFineCents(lib, loan.dueAt, now),
      reason: "overdue",
      title: `“${book.title}” came back after its due date`,
    });
    await tx.insert(activity).values({
      libraryId,
      actorId,
      action: "loan.return",
      bookId: loan.bookId,
      subjectUserId: loan.userId,
      message: `${loan.user.name ?? loan.user.email} returned “${book.title}” (${loan.copy.barcode})${late ? " late" : ""}${
        fine ? `, ${formatMoney(fine.amountCents, lib.currency)} fine` : ""
      }`,
    });
    await processHoldQueue(tx, loan.bookId);
    return { title: book.title, late, fineCents: fine?.amountCents ?? 0, currency: lib.currency, memberName: loan.user.name ?? loan.user.email };
  });
}

/** Desk check-in: scan a copy's barcode instead of finding the loan. */
export async function checkInByBarcode({ libraryId, barcode, actorId, condition }: { libraryId: string; barcode: string; actorId: string; condition?: CopyCondition }) {
  const db = await getDb();
  const code = barcode.trim().toUpperCase();
  if (!code) throw new LibraryError("Scan or type a barcode.");
  const [row] = await db
    .select({ loanId: loans.id })
    .from(loans)
    .innerJoin(copies, eq(copies.id, loans.copyId))
    .where(and(eq(loans.libraryId, libraryId), sql`upper(${copies.barcode}) = ${code}`, isNull(loans.returnedAt)));
  if (!row) {
    const [exists] = await db
      .select({ id: copies.id })
      .from(copies)
      .innerJoin(books, eq(books.id, copies.bookId))
      .where(and(eq(books.libraryId, libraryId), sql`upper(${copies.barcode}) = ${code}`));
    throw new LibraryError(exists ? `Copy ${code} isn't on loan.` : `No copy with barcode ${code} in this library.`);
  }
  return returnLoan({ libraryId, loanId: row.loanId, actorId, isStaff: true, condition });
}

export async function renewLoan({ libraryId, loanId, actorId, isStaff }: { libraryId: string; loanId: string; actorId: string; isStaff: boolean }) {
  const db = await getDb();
  const loan = await db.query.loans.findFirst({ where: eq(loans.id, loanId), with: { book: true } });
  if (!loan || loan.returnedAt || loan.libraryId !== libraryId) throw new LibraryError("Loan not found.");
  if (!isStaff && loan.userId !== actorId) throw new LibraryError("You can only renew your own books.");
  const lib = await getLibrary(db, libraryId);
  if (loan.renewals >= lib.maxRenewals) throw new LibraryError(`This loan has already been renewed ${lib.maxRenewals} times.`);
  const waiting = await db.query.holds.findFirst({
    where: and(eq(holds.bookId, loan.bookId), eq(holds.status, "waiting")),
  });
  if (waiting) throw new LibraryError("Someone is waiting for this book, so it can't be renewed.");

  const base = Math.max(loan.dueAt.getTime(), Date.now());
  const dueAt = new Date(base + lib.loanDays * DAY);
  await db.update(loans).set({ dueAt, renewals: loan.renewals + 1 }).where(eq(loans.id, loanId));
  await db.insert(activity).values({
    libraryId,
    actorId,
    action: "loan.renew",
    bookId: loan.bookId,
    subjectUserId: loan.userId,
    message: `Loan of “${loan.book.title}” renewed until ${dueAt.toDateString()}`,
  });
  return { dueAt, title: loan.book.title };
}

/** Closes a loan whose copy never came back: the copy is marked lost and a fee is charged. */
export async function markLoanLost({ libraryId, loanId, actorId }: { libraryId: string; loanId: string; actorId: string }) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const loan = await tx.query.loans.findFirst({ where: eq(loans.id, loanId), with: { user: true, copy: true } });
    if (!loan || loan.libraryId !== libraryId || loan.returnedAt) throw new LibraryError("Loan not found.");
    const book = await lockBook(tx, libraryId, loan.bookId);
    const lib = await getLibrary(tx, libraryId);
    await tx.update(loans).set({ returnedAt: new Date() }).where(eq(loans.id, loanId));
    await tx.update(copies).set({ status: "lost", note: `Lost by ${loan.user.name ?? loan.user.email}` }).where(eq(copies.id, loan.copyId));
    const fine = await chargeFine(tx, lib, {
      userId: loan.userId,
      loanId,
      amountCents: lib.lostItemFeeCents,
      reason: "lost",
      note: `Replacement for ${loan.copy.barcode}`,
      title: `Copy ${loan.copy.barcode} of “${book.title}” was marked lost`,
    });
    await tx.insert(activity).values({
      libraryId,
      actorId,
      action: "copy.lost",
      bookId: loan.bookId,
      subjectUserId: loan.userId,
      message: `Copy ${loan.copy.barcode} of “${book.title}” borrowed by ${loan.user.name ?? loan.user.email} marked lost${
        fine ? ` (${formatMoney(fine.amountCents, lib.currency)} fee)` : ""
      }`,
    });
    return { title: book.title, barcode: loan.copy.barcode, feeCents: fine?.amountCents ?? 0, currency: lib.currency };
  });
}

// ---------------------------------------------------------------------------
// Holds
// ---------------------------------------------------------------------------

export async function placeHold({ libraryId, bookId, userId }: { libraryId: string; bookId: string; userId: string }) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const book = await lockBook(tx, libraryId, bookId);
    if (!(await membershipOf(tx, libraryId, userId))) throw new LibraryError("You aren't a member of this library.");
    const existing = await tx.query.holds.findFirst({
      where: and(eq(holds.bookId, bookId), eq(holds.userId, userId), inArray(holds.status, ["waiting", "ready"])),
    });
    if (existing) throw new LibraryError("You're already on the waitlist for this book.");
    const hasIt = await tx.query.loans.findFirst({
      where: and(eq(loans.bookId, bookId), eq(loans.userId, userId), isNull(loans.returnedAt)),
    });
    if (hasIt) throw new LibraryError("You already have this book.");

    const [hold] = await tx.insert(holds).values({ libraryId, bookId, userId }).returning();
    const member = await tx.query.users.findFirst({ where: eq(users.id, userId) });
    await tx.insert(activity).values({
      libraryId,
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

export async function cancelHold({ libraryId, holdId, actorId, isStaff }: { libraryId: string; holdId: string; actorId: string; isStaff: boolean }) {
  const db = await getDb();
  const hold = await db.query.holds.findFirst({ where: eq(holds.id, holdId), with: { book: true } });
  if (!hold || hold.libraryId !== libraryId || !["waiting", "ready"].includes(hold.status)) throw new LibraryError("Hold not found.");
  if (!isStaff && hold.userId !== actorId) throw new LibraryError("You can only cancel your own holds.");
  await db.update(holds).set({ status: "cancelled" }).where(eq(holds.id, holdId));
  await processHoldQueue(db, hold.bookId);
  return { title: hold.book.title };
}

// ---------------------------------------------------------------------------
// Copies
// ---------------------------------------------------------------------------

/** Next free barcodes for a library, e.g. CEN-00071. Call inside a transaction that locks the library row. */
async function nextBarcodes(tx: Executor, lib: Library, count: number) {
  const prefix = `${lib.code}-`;
  const [{ max }] = await tx
    .select({ max: sql<number>`coalesce(max(substring(${copies.barcode} from ${prefix.length + 1}::int)::int), 0)::int` })
    .from(copies)
    .where(sql`${copies.barcode} like ${prefix + "%"} and substring(${copies.barcode} from ${prefix.length + 1}::int) ~ '^[0-9]+$'`);
  return Array.from({ length: count }, (_, i) => `${prefix}${String(max + i + 1).padStart(5, "0")}`);
}

/** Adds copies with fresh barcodes. Pass `tx` to run inside an existing transaction (e.g. when creating a book). */
export async function addCopies(
  {
    libraryId,
    bookId,
    count,
    condition = "new",
    actorId,
  }: {
    libraryId: string;
    bookId: string;
    count: number;
    condition?: CopyCondition;
    actorId: string | null;
  },
  tx?: Executor,
) {
  if (!Number.isInteger(count) || count < 1 || count > 50) throw new LibraryError("Add between 1 and 50 copies at a time.");
  const work = async (t: Executor) => {
    await t.execute(sql`select id from libraries where id = ${libraryId} for update`);
    const book = await lockBook(t, libraryId, bookId);
    const lib = await getLibrary(t, libraryId);
    const barcodes = await nextBarcodes(t, lib, count);
    const created = await t
      .insert(copies)
      .values(barcodes.map((barcode) => ({ bookId, barcode, condition })))
      .returning();
    if (actorId) {
      await t.insert(activity).values({
        libraryId,
        actorId,
        action: "copy.add",
        bookId,
        message: `Added ${count} cop${count === 1 ? "y" : "ies"} of “${book.title}” (${barcodes[0]}${count > 1 ? ` to ${barcodes.at(-1)}` : ""})`,
      });
    }
    await processHoldQueue(t, bookId); // new copies may serve the waitlist
    return { title: book.title, barcodes: created.map((c) => c.barcode) };
  };
  if (tx) return work(tx);
  const db = await getDb();
  return db.transaction(work);
}

/** Change a copy's condition or status. Copies on loan can't be withdrawn (use "mark lost"). */
export async function updateCopy({
  libraryId,
  copyId,
  condition,
  status,
  note,
  actorId,
}: {
  libraryId: string;
  copyId: string;
  condition?: CopyCondition;
  status?: "active" | "lost" | "withdrawn";
  note?: string | null;
  actorId: string;
}) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const copy = await tx.query.copies.findFirst({ where: eq(copies.id, copyId), with: { book: true } });
    if (!copy || copy.book.libraryId !== libraryId) throw new LibraryError("Copy not found.");
    await lockBook(tx, libraryId, copy.bookId);
    if (status && status !== "active" && status !== copy.status) {
      const onLoan = await tx.query.loans.findFirst({ where: and(eq(loans.copyId, copyId), isNull(loans.returnedAt)) });
      if (onLoan) throw new LibraryError(`${copy.barcode} is on loan. Check it in first, or mark the loan as lost.`);
    }
    const patch: Partial<typeof copies.$inferInsert> = {};
    if (condition && condition !== copy.condition) patch.condition = condition;
    if (status && status !== copy.status) patch.status = status;
    if (note !== undefined && (note || null) !== copy.note) patch.note = note || null;
    if (!Object.keys(patch).length) return { barcode: copy.barcode, title: copy.book.title, what: "unchanged" };
    await tx.update(copies).set(patch).where(eq(copies.id, copyId));
    const what = patch.status
      ? patch.status === "active"
        ? "returned to circulation"
        : patch.status === "lost"
          ? "marked lost"
          : "withdrawn"
      : patch.condition
        ? `condition set to ${patch.condition}`
        : "note updated";
    await tx.insert(activity).values({
      libraryId,
      actorId,
      action: "copy.update",
      bookId: copy.bookId,
      message: `Copy ${copy.barcode} of “${copy.book.title}” ${what}`,
    });
    await processHoldQueue(tx, copy.bookId);
    return { barcode: copy.barcode, title: copy.book.title, what };
  });
}

// ---------------------------------------------------------------------------
// Fines
// ---------------------------------------------------------------------------

export async function resolveFine({
  libraryId,
  fineId,
  outcome,
  actorId,
  note,
}: {
  libraryId: string;
  fineId: string;
  outcome: "paid" | "waived";
  actorId: string;
  note?: string;
}) {
  const db = await getDb();
  const fine = await db.query.fines.findFirst({ where: eq(fines.id, fineId), with: { user: true } });
  if (!fine || fine.libraryId !== libraryId) throw new LibraryError("Fine not found.");
  if (fine.status !== "open") throw new LibraryError("This fine is already settled.");
  const lib = await getLibrary(db, libraryId);
  await db
    .update(fines)
    .set({ status: outcome, resolvedAt: new Date(), resolvedById: actorId, note: note?.trim() || fine.note })
    .where(and(eq(fines.id, fineId), eq(fines.status, "open")));
  const amount = formatMoney(fine.amountCents, lib.currency);
  await db.insert(activity).values({
    libraryId,
    actorId,
    action: outcome === "paid" ? "fine.paid" : "fine.waived",
    subjectUserId: fine.userId,
    message: `${amount} ${fine.reason} fine for ${fine.user.name ?? fine.user.email} ${outcome}`,
  });
  return { amount, memberName: fine.user.name ?? fine.user.email };
}

/** A manual charge at the desk, e.g. for a damaged book. */
export async function addFine({
  libraryId,
  userId,
  amountCents,
  reason,
  note,
  actorId,
}: {
  libraryId: string;
  userId: string;
  amountCents: number;
  reason: "damaged" | "lost" | "overdue";
  note?: string;
  actorId: string;
}) {
  if (!Number.isInteger(amountCents) || amountCents < 1 || amountCents > 100_000) throw new LibraryError("Enter an amount between 0.01 and 1,000.");
  const db = await getDb();
  const member = await membershipOf(db, libraryId, userId);
  if (!member) throw new LibraryError("That person isn't a member of this library.");
  const lib = await getLibrary(db, libraryId);
  const fine = await chargeFine(db, lib, { userId, amountCents, reason, note, title: note?.trim() || "A charge was added to your account" });
  await db.insert(activity).values({
    libraryId,
    actorId,
    action: "fine.add",
    subjectUserId: userId,
    message: `${formatMoney(amountCents, lib.currency)} ${reason} fine added for ${member.name ?? member.email}`,
  });
  return { fine, memberName: member.name ?? member.email, amount: formatMoney(amountCents, lib.currency) };
}
