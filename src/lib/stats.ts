import "server-only";
import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { activity, books, copies, fines, holds, loans, memberships, users } from "@/lib/db/schema";

const DAY = 24 * 60 * 60 * 1000;

export async function getLibraryStats(libraryId: string) {
  const db = await getDb();
  const now = new Date();
  const [[titles], [copyCount], [onLoan], [overdue], [members], [waiting], [last30], [owed]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(books).where(eq(books.libraryId, libraryId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(copies)
      .innerJoin(books, eq(books.id, copies.bookId))
      .where(and(eq(books.libraryId, libraryId), eq(copies.status, "active"))),
    db.select({ n: sql<number>`count(*)::int` }).from(loans).where(and(eq(loans.libraryId, libraryId), isNull(loans.returnedAt))),
    db.select({ n: sql<number>`count(*)::int` }).from(loans).where(and(eq(loans.libraryId, libraryId), isNull(loans.returnedAt), lt(loans.dueAt, now))),
    db.select({ n: sql<number>`count(*)::int` }).from(memberships).where(and(eq(memberships.libraryId, libraryId), eq(memberships.role, "member"))),
    db.select({ n: sql<number>`count(*)::int` }).from(holds).where(and(eq(holds.libraryId, libraryId), eq(holds.status, "waiting"))),
    db.select({ n: sql<number>`count(*)::int` }).from(loans).where(and(eq(loans.libraryId, libraryId), gte(loans.borrowedAt, new Date(now.getTime() - 30 * DAY)))),
    db
      .select({ n: sql<number>`coalesce(sum(${fines.amountCents}), 0)::int`, people: sql<number>`count(distinct ${fines.userId})::int` })
      .from(fines)
      .where(and(eq(fines.libraryId, libraryId), eq(fines.status, "open"))),
  ]);
  return {
    titles: titles.n,
    copies: copyCount.n,
    onLoan: onLoan.n,
    overdue: overdue.n,
    members: members.n,
    waiting: waiting.n,
    loans30d: last30.n,
    owedCents: owed.n,
    owingMembers: owed.people,
    utilisation: copyCount.n ? Math.round((onLoan.n / copyCount.n) * 100) : 0,
  };
}

/** Loans started per week for the last N weeks (zero-filled). */
export async function getWeeklyLoans(libraryId: string, weeks = 12) {
  const db = await getDb();
  const since = new Date(Date.now() - weeks * 7 * DAY);
  const rows = await db
    .select({
      week: sql<string>`to_char(date_trunc('week', ${loans.borrowedAt}), 'YYYY-MM-DD')`,
      loans: sql<number>`count(*)::int`,
    })
    .from(loans)
    .where(and(eq(loans.libraryId, libraryId), gte(loans.borrowedAt, since)))
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

export async function getGenreBreakdown(libraryId: string, days = 90) {
  const db = await getDb();
  return db
    .select({ genre: sql<string>`coalesce(${books.genre}, 'Other')`, loans: sql<number>`count(*)::int` })
    .from(loans)
    .innerJoin(books, eq(books.id, loans.bookId))
    .where(and(eq(loans.libraryId, libraryId), gte(loans.borrowedAt, new Date(Date.now() - days * DAY))))
    .groupBy(sql`1`)
    .orderBy(desc(sql`2`))
    .limit(7);
}

export async function getTopBooks(libraryId: string, limit = 5, days = 90) {
  const db = await getDb();
  return db
    .select({ id: books.id, title: books.title, author: books.author, coverUrl: books.coverUrl, loans: sql<number>`count(*)::int` })
    .from(loans)
    .innerJoin(books, eq(books.id, loans.bookId))
    .where(and(eq(loans.libraryId, libraryId), gte(loans.borrowedAt, new Date(Date.now() - days * DAY))))
    .groupBy(books.id)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
}

export async function getOverdueLoans(libraryId: string, limit = 6) {
  const db = await getDb();
  return db.query.loans.findMany({
    where: and(eq(loans.libraryId, libraryId), isNull(loans.returnedAt), lt(loans.dueAt, new Date())),
    with: { book: { columns: { id: true, title: true } }, user: { columns: { name: true, email: true } } },
    orderBy: loans.dueAt,
    limit,
  });
}

export async function getRecentActivity(libraryId: string, limit = 8) {
  const db = await getDb();
  return db.query.activity.findMany({
    where: eq(activity.libraryId, libraryId),
    orderBy: desc(activity.createdAt),
    limit,
    with: { actor: { columns: { name: true } } },
  });
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const REPORT_RANGES = [30, 90, 365] as const;
export type ReportRange = (typeof REPORT_RANGES)[number];

/** Everything on the reports page for one library and period. */
export async function getReport(libraryId: string, days: ReportRange) {
  const db = await getDb();
  const since = new Date(Date.now() - days * DAY);
  const bucket = days > 90 ? "month" : "week";
  const inRange = and(eq(loans.libraryId, libraryId), gte(loans.borrowedAt, since));

  const [[circ], [returned], [money], [joined], series, fineSeries, genres, topBooks, topMembers, collection] = await Promise.all([
    db
      .select({ loans: sql<number>`count(*)::int`, borrowers: sql<number>`count(distinct ${loans.userId})::int`, titles: sql<number>`count(distinct ${loans.bookId})::int` })
      .from(loans)
      .where(inRange),
    db
      .select({
        n: sql<number>`count(*)::int`,
        late: sql<number>`count(*) filter (where ${loans.returnedAt} > ${loans.dueAt})::int`,
        avgDays: sql<number | null>`round(avg(extract(epoch from (${loans.returnedAt} - ${loans.borrowedAt})) / 86400)::numeric, 1)::float`,
      })
      .from(loans)
      .where(and(eq(loans.libraryId, libraryId), gte(loans.returnedAt, since))),
    db
      .select({
        charged: sql<number>`coalesce(sum(${fines.amountCents}) filter (where ${fines.createdAt} >= ${since}), 0)::int`,
        collected: sql<number>`coalesce(sum(${fines.amountCents}) filter (where ${fines.status} = 'paid' and ${fines.resolvedAt} >= ${since}), 0)::int`,
        waived: sql<number>`coalesce(sum(${fines.amountCents}) filter (where ${fines.status} = 'waived' and ${fines.resolvedAt} >= ${since}), 0)::int`,
        outstanding: sql<number>`coalesce(sum(${fines.amountCents}) filter (where ${fines.status} = 'open'), 0)::int`,
      })
      .from(fines)
      .where(eq(fines.libraryId, libraryId)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(memberships)
      .where(and(eq(memberships.libraryId, libraryId), gte(memberships.createdAt, since))),
    db
      .select({
        period: sql<string>`to_char(date_trunc(${bucket}, ${loans.borrowedAt}), 'YYYY-MM-DD')`,
        loans: sql<number>`count(*)::int`,
        late: sql<number>`count(*) filter (where coalesce(${loans.returnedAt}, now()) > ${loans.dueAt})::int`,
      })
      .from(loans)
      .where(inRange)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        period: sql<string>`to_char(date_trunc(${bucket}, ${fines.createdAt}), 'YYYY-MM-DD')`,
        cents: sql<number>`sum(${fines.amountCents})::int`,
      })
      .from(fines)
      .where(and(eq(fines.libraryId, libraryId), gte(fines.createdAt, since)))
      .groupBy(sql`1`),
    db
      .select({ genre: sql<string>`coalesce(${books.genre}, 'Other')`, loans: sql<number>`count(*)::int` })
      .from(loans)
      .innerJoin(books, eq(books.id, loans.bookId))
      .where(inRange)
      .groupBy(sql`1`)
      .orderBy(desc(sql`2`))
      .limit(8),
    db
      .select({ id: books.id, title: books.title, author: books.author, loans: sql<number>`count(*)::int` })
      .from(loans)
      .innerJoin(books, eq(books.id, loans.bookId))
      .where(inRange)
      .groupBy(books.id)
      .orderBy(desc(sql`count(*)`), books.title)
      .limit(8),
    db
      .select({ id: users.id, name: sql<string>`coalesce(${users.name}, ${users.email})`, loans: sql<number>`count(*)::int` })
      .from(loans)
      .innerJoin(users, eq(users.id, loans.userId))
      .where(inRange)
      .groupBy(users.id)
      .orderBy(desc(sql`count(*)`), sql`2`)
      .limit(8),
    db
      .select({ status: copies.status, condition: copies.condition, n: sql<number>`count(*)::int` })
      .from(copies)
      .innerJoin(books, eq(books.id, copies.bookId))
      .where(eq(books.libraryId, libraryId))
      .groupBy(copies.status, copies.condition),
  ]);

  // Zero-filled periods so the chart has no gaps.
  const fineBy = new Map(fineSeries.map((f) => [f.period, f.cents]));
  const loanBy = new Map(series.map((s) => [s.period, s]));
  const periods: { period: string; loans: number; late: number; finesCents: number }[] = [];
  const cursor = new Date(since);
  cursor.setUTCHours(0, 0, 0, 0);
  if (bucket === "month") cursor.setUTCDate(1);
  else cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7));
  while (cursor <= new Date()) {
    const key = cursor.toISOString().slice(0, 10);
    periods.push({ period: key, loans: loanBy.get(key)?.loans ?? 0, late: loanBy.get(key)?.late ?? 0, finesCents: fineBy.get(key) ?? 0 });
    if (bucket === "month") cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  const active = collection.filter((c) => c.status === "active");
  return {
    days,
    bucket,
    since,
    summary: {
      loans: circ.loans,
      borrowers: circ.borrowers,
      titlesBorrowed: circ.titles,
      returns: returned.n,
      lateReturns: returned.late,
      lateRate: returned.n ? Math.round((returned.late / returned.n) * 1000) / 10 : 0,
      avgLoanDays: returned.avgDays ?? 0,
      newMembers: joined.n,
      finesCharged: money.charged,
      finesCollected: money.collected,
      finesWaived: money.waived,
      finesOutstanding: money.outstanding,
    },
    periods,
    genres,
    topBooks,
    topMembers,
    collection: {
      active: active.reduce((s, c) => s + c.n, 0),
      lost: collection.filter((c) => c.status === "lost").reduce((s, c) => s + c.n, 0),
      withdrawn: collection.filter((c) => c.status === "withdrawn").reduce((s, c) => s + c.n, 0),
      byCondition: (["new", "good", "fair", "poor", "damaged"] as const).map((condition) => ({
        condition,
        n: active.filter((c) => c.condition === condition).reduce((s, c) => s + c.n, 0),
      })),
    },
  };
}

/** Every loan started in the period, for CSV export. */
export async function getLoanRows(libraryId: string, days: ReportRange) {
  const db = await getDb();
  return db
    .select({
      borrowedAt: loans.borrowedAt,
      dueAt: loans.dueAt,
      returnedAt: loans.returnedAt,
      renewals: loans.renewals,
      title: books.title,
      author: books.author,
      barcode: copies.barcode,
      member: users.name,
      email: users.email,
    })
    .from(loans)
    .innerJoin(books, eq(books.id, loans.bookId))
    .innerJoin(copies, eq(copies.id, loans.copyId))
    .innerJoin(users, eq(users.id, loans.userId))
    .where(and(eq(loans.libraryId, libraryId), gte(loans.borrowedAt, new Date(Date.now() - days * DAY))))
    .orderBy(loans.borrowedAt);
}

export async function getFineRows(libraryId: string, days: ReportRange) {
  const db = await getDb();
  return db
    .select({
      createdAt: fines.createdAt,
      amountCents: fines.amountCents,
      reason: fines.reason,
      status: fines.status,
      resolvedAt: fines.resolvedAt,
      note: fines.note,
      member: users.name,
      email: users.email,
    })
    .from(fines)
    .innerJoin(users, eq(users.id, fines.userId))
    .where(and(eq(fines.libraryId, libraryId), gte(fines.createdAt, new Date(Date.now() - days * DAY))))
    .orderBy(fines.createdAt);
}
