import Link from "next/link";
import { Suspense } from "react";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { differenceInCalendarDays, format, formatDistanceToNowStrict } from "date-fns";
import { AlertTriangle, ArrowRight, BellRing, BookCopy, BookMarked, BookOpen, Clock, LibraryBig, ShieldAlert, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookCover } from "@/components/book-cover";
import { BookGrid } from "@/components/books/book-views";
import { getDb } from "@/lib/db/client";
import { holds, loans } from "@/lib/db/schema";
import { searchBooks } from "@/lib/library";
import { can } from "@/lib/permissions";
import { requireUser, type CurrentUser } from "@/lib/session";
import { getGenreBreakdown, getLibraryStats, getOverdueLoans, getRecentActivity, getTopBooks, getWeeklyLoans } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { BorrowReservedButton } from "../books/[id]/book-actions";
import { GenreChart, WeeklyLoansChart } from "./charts";
import { Recommendations, RecommendationsSkeleton } from "./recommendations";

export const metadata = { title: "Dashboard" };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function Stat({ icon: Icon, label, value, hint, tone }: { icon: typeof Users; label: string; value: React.ReactNode; hint?: string; tone?: "danger" | "accent" }) {
  return (
    <Card className="gap-2 py-4">
      <CardContent className="space-y-2 px-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          {label}
          <Icon className={cn("size-4", tone === "danger" ? "text-destructive" : "text-primary")} />
        </div>
        <p className={cn("font-heading text-3xl font-semibold tabular-nums", tone === "danger" && "text-destructive")}>{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  const denied = (await searchParams).denied === "1";
  const staff = can(user.role, "reports:view");

  return (
    <div className="space-y-10">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, MMMM d")}</p>
        <h1 className="text-3xl font-semibold sm:text-4xl">
          {greeting()}, {user.name.split(" ")[0]}
        </h1>
      </div>
      {denied && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <ShieldAlert className="size-4 text-warning" /> That page needs a different role. You&apos;ve been brought back to your dashboard.
        </div>
      )}
      <MemberSection user={user} />
      {staff && <StaffSection />}
      {!staff && (
        <Suspense fallback={<RecommendationsSkeleton />}>
          <Recommendations userId={user.id} />
        </Suspense>
      )}
      <Discover />
    </div>
  );
}

async function MemberSection({ user }: { user: CurrentUser }) {
  const db = await getDb();
  const staff = can(user.role, "loans:manage");
  const [myLoans, myHolds, [{ read }]] = await Promise.all([
    db.query.loans.findMany({ where: and(eq(loans.userId, user.id), isNull(loans.returnedAt)), with: { book: true }, orderBy: asc(loans.dueAt) }),
    db.query.holds.findMany({ where: and(eq(holds.userId, user.id), inArray(holds.status, ["waiting", "ready"])), with: { book: true } }),
    db.select({ read: sql<number>`count(distinct ${loans.bookId})::int` }).from(loans).where(eq(loans.userId, user.id)),
  ]);
  const ready = myHolds.filter((h) => h.status === "ready");
  const overdue = myLoans.filter((l) => l.dueAt < new Date());
  const dueSoon = myLoans.filter((l) => l.dueAt >= new Date() && differenceInCalendarDays(l.dueAt, new Date()) <= 7);

  // Staff get the library-wide picture below; keep their personal section light.
  if (staff && myLoans.length === 0 && myHolds.length === 0) return null;

  return (
    <div className="space-y-6">
      {(ready.length > 0 || overdue.length > 0) && (
        <div className="space-y-2">
          {ready.map((h) => (
            <div key={h.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/8 px-4 py-3">
              <p className="flex items-center gap-2 text-sm">
                <BellRing className="size-4 text-success" />
                <span>
                  Good news! <strong>{h.book.title}</strong> is reserved for you
                  {h.expiresAt ? ` until ${format(h.expiresAt, "EEEE, MMM d")}` : ""}.
                </span>
              </p>
              <BorrowReservedButton bookId={h.book.id} />
            </div>
          ))}
          {overdue.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3">
              <p className="flex items-center gap-2 text-sm">
                <AlertTriangle className="size-4 text-destructive" />
                <span>
                  <strong>{l.book.title}</strong> was due {formatDistanceToNowStrict(l.dueAt, { addSuffix: true })}. Please return it so others can enjoy it.
                </span>
              </p>
              <Button size="sm" variant="outline" asChild>
                <Link href="/loans?view=mine">Manage loans</Link>
              </Button>
            </div>
          ))}
        </div>
      )}

      {!staff && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat icon={BookMarked} label="Borrowed now" value={myLoans.length} hint="Up to 5 at a time" />
          <Stat icon={Clock} label="Due this week" value={dueSoon.length + overdue.length} tone={overdue.length ? "danger" : undefined} hint={overdue.length ? `${overdue.length} overdue` : "All on time"} />
          <Stat icon={BellRing} label="On waitlists" value={myHolds.length} hint={ready.length ? `${ready.length} ready to pick up` : undefined} />
          <Stat icon={BookOpen} label="Books read" value={read} hint="All time" />
        </div>
      )}

      {myLoans.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="text-xl font-semibold">On your nightstand</h2>
            <Link href="/loans?view=mine" className="flex items-center gap-1 text-sm text-primary hover:underline">
              All loans <ArrowRight className="size-3.5" />
            </Link>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {myLoans.map((l) => {
              const days = differenceInCalendarDays(l.dueAt, new Date());
              return (
                <Link key={l.id} href={`/books/${l.book.id}`} className="group w-32 shrink-0 space-y-2">
                  <BookCover title={l.book.title} author={l.book.author} coverUrl={l.book.coverUrl} size="sm" />
                  <p className="line-clamp-1 text-sm font-medium group-hover:text-primary">{l.book.title}</p>
                  <p className={cn("text-xs", days < 0 ? "font-medium text-destructive" : days <= 3 ? "text-warning" : "text-muted-foreground")}>
                    {days < 0 ? "Overdue" : days === 0 ? "Due today" : `Due in ${days} day${days > 1 ? "s" : ""}`}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

async function StaffSection() {
  const [stats, weekly, genres, top, overdue, recent] = await Promise.all([
    getLibraryStats(),
    getWeeklyLoans(12),
    getGenreBreakdown(),
    getTopBooks(5),
    getOverdueLoans(6),
    getRecentActivity(8),
  ]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat icon={LibraryBig} label="Titles" value={stats.titles} hint={`${stats.copies} copies`} />
        <Stat icon={BookCopy} label="On loan" value={stats.onLoan} hint={`${stats.utilisation}% of copies in use`} />
        <Stat icon={AlertTriangle} label="Overdue" value={stats.overdue} tone={stats.overdue ? "danger" : undefined} hint="Needs follow-up" />
        <Stat icon={Users} label="Members" value={stats.members} hint={`${stats.loans30d} loans in 30 days`} />
        <Stat icon={BellRing} label="Waiting" value={stats.waiting} hint="Members on waitlists" />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Borrowing activity</CardTitle>
            <CardDescription>New loans per week, last 12 weeks</CardDescription>
          </CardHeader>
          <CardContent>
            <WeeklyLoansChart data={weekly} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Popular genres</CardTitle>
            <CardDescription>Loans in the last 90 days</CardDescription>
          </CardHeader>
          <CardContent>
            <GenreChart data={genres} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Most borrowed</CardTitle>
            <CardDescription>Last 90 days</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {top.map((b, i) => (
                <li key={b.id}>
                  <Link href={`/books/${b.id}`} className="group flex items-center gap-3">
                    <span className="w-4 text-sm font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
                    <BookCover title={b.title} author={b.author} coverUrl={b.coverUrl} size="sm" className="w-8 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium group-hover:text-primary">{b.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{b.author}</span>
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">{b.loans}×</span>
                  </Link>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Overdue</CardTitle>
            <CardDescription>Oldest first</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/loans?filter=overdue">View all</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {overdue.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing overdue. Nice!</p>
            ) : (
              <ul className="space-y-3">
                {overdue.map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0">
                      <Link href={`/books/${l.book.id}`} className="block truncate font-medium hover:text-primary">
                        {l.book.title}
                      </Link>
                      <span className="text-xs text-muted-foreground">{l.user.name ?? l.user.email}</span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-destructive">{formatDistanceToNowStrict(l.dueAt)} late</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>Across the library</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/activity">View all</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {recent.map((a) => (
                <li key={a.id} className="text-sm">
                  <p className="line-clamp-2">{a.message}</p>
                  <p className="text-xs text-muted-foreground">{formatDistanceToNowStrict(a.createdAt, { addSuffix: true })}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function Discover() {
  const [newest, popular] = await Promise.all([searchBooks({ sort: "newest", limit: 5 }), searchBooks({ sort: "rating", limit: 5 })]);
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-semibold">Highest rated</h2>
          <Link href="/books?sort=rating" className="flex items-center gap-1 text-sm text-primary hover:underline">
            See all <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <BookGrid books={popular} />
      </section>
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-semibold">New arrivals</h2>
          <Link href="/books?sort=newest" className="flex items-center gap-1 text-sm text-primary hover:underline">
            See all <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <BookGrid books={newest} />
      </section>
      <Link
        href="/assistant"
        className="group flex items-center justify-between gap-4 rounded-2xl border bg-[oklch(0.3_0.06_162)] p-6 text-[oklch(0.95_0.02_85)] transition-transform hover:-translate-y-0.5"
      >
        <div className="space-y-1">
          <p className="flex items-center gap-2 font-heading text-xl">
            <Sparkles className="size-5" /> Not sure what to read next?
          </p>
          <p className="text-sm opacity-80">Ask Folio, our AI librarian. It knows every book on our shelves and what&apos;s available right now.</p>
        </div>
        <ArrowRight className="size-5 shrink-0 transition-transform group-hover:translate-x-1" />
      </Link>
    </div>
  );
}
