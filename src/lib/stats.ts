import "server-only";
import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { activity, books, holds, loans, users } from "@/lib/db/schema";

const DAY = 24 * 60 * 60 * 1000;

export async function getLibraryStats() {
  const db = await getDb();
  const now = new Date();
  const [[titles], [onLoan], [overdue], [members], [waiting], [last30]] = await Promise.all([
    db.select({ titles: sql<number>`count(*)::int`, copies: sql<number>`coalesce(sum(${books.totalCopies}), 0)::int` }).from(books),
    db.select({ n: sql<number>`count(*)::int` }).from(loans).where(isNull(loans.returnedAt)),
    db.select({ n: sql<number>`count(*)::int` }).from(loans).where(and(isNull(loans.returnedAt), lt(loans.dueAt, now))),
    db.select({ n: sql<number>`count(*)::int` }).from(users).where(eq(users.role, "member")),
    db.select({ n: sql<number>`count(*)::int` }).from(holds).where(eq(holds.status, "waiting")),
    db.select({ n: sql<number>`count(*)::int` }).from(loans).where(gte(loans.borrowedAt, new Date(now.getTime() - 30 * DAY))),
  ]);
  return {
    titles: titles.titles,
    copies: titles.copies,
    onLoan: onLoan.n,
    overdue: overdue.n,
    members: members.n,
    waiting: waiting.n,
    loans30d: last30.n,
    utilisation: titles.copies ? Math.round((onLoan.n / titles.copies) * 100) : 0,
  };
}

/** Loans started per week for the last N weeks (zero-filled). */
export async function getWeeklyLoans(weeks = 12) {
  const db = await getDb();
  const since = new Date(Date.now() - weeks * 7 * DAY);
  const rows = await db
    .select({
      week: sql<string>`to_char(date_trunc('week', ${loans.borrowedAt}), 'YYYY-MM-DD')`,
      loans: sql<number>`count(*)::int`,
      returned: sql<number>`count(${loans.returnedAt})::int`,
    })
    .from(loans)
    .where(gte(loans.borrowedAt, since))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  const byWeek = new Map(rows.map((r) => [r.week, r]));
  const out: { week: string; loans: number }[] = [];
  const start = new Date(since);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7)); // Monday
  for (let d = start; d <= new Date(); d = new Date(d.getTime() + 7 * DAY)) {
    const key = d.toISOString().slice(0, 10);
    out.push({ week: key, loans: byWeek.get(key)?.loans ?? 0 });
  }
  return out.slice(-weeks);
}

export async function getGenreBreakdown() {
  const db = await getDb();
  return db
    .select({ genre: sql<string>`coalesce(${books.genre}, 'Other')`, loans: sql<number>`count(*)::int` })
    .from(loans)
    .innerJoin(books, eq(books.id, loans.bookId))
    .where(gte(loans.borrowedAt, new Date(Date.now() - 90 * DAY)))
    .groupBy(sql`1`)
    .orderBy(desc(sql`2`))
    .limit(7);
}

export async function getTopBooks(limit = 5) {
  const db = await getDb();
  return db
    .select({ id: books.id, title: books.title, author: books.author, coverUrl: books.coverUrl, loans: sql<number>`count(*)::int` })
    .from(loans)
    .innerJoin(books, eq(books.id, loans.bookId))
    .where(gte(loans.borrowedAt, new Date(Date.now() - 90 * DAY)))
    .groupBy(books.id)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
}

export async function getOverdueLoans(limit = 6) {
  const db = await getDb();
  return db.query.loans.findMany({
    where: and(isNull(loans.returnedAt), lt(loans.dueAt, new Date())),
    with: { book: { columns: { id: true, title: true } }, user: { columns: { name: true, email: true } } },
    orderBy: loans.dueAt,
    limit,
  });
}

export async function getRecentActivity(limit = 8) {
  const db = await getDb();
  return db.query.activity.findMany({
    orderBy: desc(activity.createdAt),
    limit,
    with: { actor: { columns: { name: true } } },
  });
}
