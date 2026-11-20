import Link from "next/link";
import { Suspense } from "react";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { differenceInCalendarDays } from "date-fns";
import { AlertTriangle, ArrowRight, BellRing, BookCopy, BookMarked, BookOpen, Clock, LibraryBig, Receipt, ShieldAlert, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookCover } from "@/components/book-cover";
import { BookGrid } from "@/components/books/book-views";
import { getDb } from "@/lib/db/client";
import { holds, loans } from "@/lib/db/schema";
import { getBalance, searchBooks } from "@/lib/library";
import { can } from "@/lib/permissions";
import { requireUser, type CurrentUser } from "@/lib/session";
import { getGenreBreakdown, getLibraryStats, getOverdueLoans, getRecentActivity, getTopBooks, getWeeklyLoans } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { BorrowReservedButton } from "../books/[id]/book-actions";
import { GenreChart, WeeklyLoansChart } from "./charts";
import { Recommendations, RecommendationsSkeleton } from "./recommendations";
import { getI18n } from "@/i18n/server";
import { renderStored } from "@/i18n/stored";
import type { Translator } from "@/i18n";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("nav.dashboard") };
}

function greeting({ t }: Translator) {
  const h = new Date().getHours();
  return h < 12 ? t("dashboard.morning") : h < 18 ? t("dashboard.afternoon") : t("dashboard.evening");
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
  const i18n = await getI18n();
  const { t } = i18n;

  return (
    <div className="space-y-10">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{i18n.date(new Date(), "weekday")}</p>
        <h1 className="text-3xl font-semibold sm:text-4xl">
          {t("dashboard.greeting", { greeting: greeting(i18n), name: user.name.split(" ")[0] })}
        </h1>
      </div>
      {denied && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <ShieldAlert className="size-4 text-warning" /> {t("dashboard.denied")}
        </div>
      )}
      <MemberSection user={user} />
      {staff && <StaffSection user={user} />}
      {!staff && (
        <Suspense fallback={<RecommendationsSkeleton />}>
          <Recommendations userId={user.id} libraryId={user.library.id} />
        </Suspense>
      )}
      <Discover libraryId={user.library.id} />
    </div>
  );
}

async function MemberSection({ user }: { user: CurrentUser }) {
  const db = await getDb();
  const staff = can(user.role, "loans:manage");
  const lib = user.library;
  const { t, rich, money, date, relative } = await getI18n();
  const [myLoans, myHolds, [{ read }], owed] = await Promise.all([
    db.query.loans.findMany({ where: and(eq(loans.libraryId, lib.id), eq(loans.userId, user.id), isNull(loans.returnedAt)), with: { book: true }, orderBy: asc(loans.dueAt) }),
    db.query.holds.findMany({ where: and(eq(holds.libraryId, lib.id), eq(holds.userId, user.id), inArray(holds.status, ["waiting", "ready"])), with: { book: true } }),
    db.select({ read: sql<number>`count(distinct ${loans.bookId})::int` }).from(loans).where(and(eq(loans.libraryId, lib.id), eq(loans.userId, user.id))),
    getBalance(db, lib.id, user.id),
  ]);
  const blocked = lib.blockAtCents > 0 && owed >= lib.blockAtCents;
  const ready = myHolds.filter((h) => h.status === "ready");
  const overdue = myLoans.filter((l) => l.dueAt < new Date());
  const dueSoon = myLoans.filter((l) => l.dueAt >= new Date() && differenceInCalendarDays(l.dueAt, new Date()) <= 7);

  // Staff get the library-wide picture below; keep their personal section light.
  if (staff && myLoans.length === 0 && myHolds.length === 0 && owed === 0) return null;

  return (
    <div className="space-y-6">
      {(ready.length > 0 || overdue.length > 0 || blocked) && (
        <div className="space-y-2">
          {blocked && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3">
              <p className="flex items-center gap-2 text-sm">
                <Receipt className="size-4 text-destructive" />
                <span>{rich("dashboard.blocked", { amount: <strong>{money(owed, lib.currency)}</strong> })}</span>
              </p>
              <Button size="sm" variant="outline" asChild>
                <Link href="/loans?view=mine#fines">{t("dashboard.seeFines")}</Link>
              </Button>
            </div>
          )}
          {ready.map((h) => (
            <div key={h.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/8 px-4 py-3">
              <p className="flex items-center gap-2 text-sm">
                <BellRing className="size-4 text-success" />
                <span>
                  {h.expiresAt
                    ? rich("dashboard.reservedUntil", { title: <strong>{h.book.title}</strong>, date: date(h.expiresAt, "weekday") })
                    : rich("dashboard.reserved", { title: <strong>{h.book.title}</strong> })}
                </span>
              </p>
              <BorrowReservedButton bookId={h.book.id} />
            </div>
          ))}
          {overdue.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3">
              <p className="flex items-center gap-2 text-sm">
                <AlertTriangle className="size-4 text-destructive" />
                <span>{rich("dashboard.wasDue", { title: <strong>{l.book.title}</strong>, when: relative(l.dueAt) })}</span>
              </p>
              <Button size="sm" variant="outline" asChild>
                <Link href="/loans?view=mine">{t("dashboard.manageLoans")}</Link>
              </Button>
            </div>
          ))}
        </div>
      )}

      {!staff && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat icon={BookMarked} label={t("dashboard.borrowedNow")} value={myLoans.length} hint={t("dashboard.upTo", { count: lib.maxLoans })} />
          <Stat
            icon={Clock}
            label={t("dashboard.dueThisWeek")}
            value={dueSoon.length + overdue.length}
            tone={overdue.length ? "danger" : undefined}
            hint={overdue.length ? t("dashboard.overdueCount", { count: overdue.length }) : t("dashboard.allOnTime")}
          />
          <Stat icon={BellRing} label={t("dashboard.onWaitlists")} value={myHolds.length} hint={ready.length ? t("dashboard.readyCount", { count: ready.length }) : undefined} />
          {owed > 0 ? (
            <Stat
              icon={Receipt}
              label={t("dashboard.finesOwed")}
              value={money(owed, lib.currency)}
              tone={blocked ? "danger" : undefined}
              hint={blocked ? t("dashboard.borrowingPaused") : t("dashboard.payDesk")}
            />
          ) : (
            <Stat icon={BookOpen} label={t("dashboard.booksRead")} value={read} hint={t("dashboard.allTime")} />
          )}
        </div>
      )}

      {myLoans.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="text-xl font-semibold">{t("dashboard.nightstand")}</h2>
            <Link href="/loans?view=mine" className="flex items-center gap-1 text-sm text-primary hover:underline">
              {t("dashboard.allLoans")} <ArrowRight className="size-3.5" />
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
                    {days < 0 ? t("loans.overdue") : days === 0 ? t("loans.dueToday") : t("loans.dueInDays", { count: days })}
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

async function StaffSection({ user }: { user: CurrentUser }) {
  const id = user.library.id;
  const i18n = await getI18n();
  const { t, money, relative } = i18n;
  const [stats, weekly, genres, top, overdue, recent] = await Promise.all([
    getLibraryStats(id),
    getWeeklyLoans(id, 12),
    getGenreBreakdown(id),
    getTopBooks(id, 5),
    getOverdueLoans(id, 6),
    getRecentActivity(id, 8),
  ]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Stat icon={LibraryBig} label={t("dashboard.titles")} value={stats.titles} hint={t("dashboard.copiesCount", { count: stats.copies })} />
        <Stat icon={BookCopy} label={t("books.onLoan")} value={stats.onLoan} hint={t("dashboard.inUse", { percent: stats.utilisation })} />
        <Stat icon={AlertTriangle} label={t("loans.overdue")} value={stats.overdue} tone={stats.overdue ? "danger" : undefined} hint={t("dashboard.needsFollowUp")} />
        <Stat icon={Users} label={t("dashboard.members")} value={stats.members} hint={t("dashboard.loans30d", { count: stats.loans30d })} />
        <Stat icon={BellRing} label={t("dashboard.waiting")} value={stats.waiting} hint={t("dashboard.onWaitlistsHint")} />
        <Stat icon={Receipt} label={t("dashboard.finesOwed")} value={money(stats.owedCents, user.library.currency)} hint={t("dashboard.membersCount", { count: stats.owingMembers })} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t("dashboard.borrowingActivity")}</CardTitle>
            <CardDescription>{t("dashboard.borrowingActivityHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <WeeklyLoansChart data={weekly} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("dashboard.popularGenres")}</CardTitle>
            <CardDescription>{t("dashboard.last90Loans")}</CardDescription>
          </CardHeader>
          <CardContent>
            <GenreChart data={genres} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.mostBorrowed")}</CardTitle>
            <CardDescription>{t("dashboard.last90")}</CardDescription>
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
            <CardTitle>{t("loans.overdue")}</CardTitle>
            <CardDescription>{t("dashboard.oldestFirst")}</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/loans?filter=overdue">{t("dashboard.viewAll")}</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {overdue.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("dashboard.nothingOverdue")}</p>
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
                    <span className="shrink-0 text-xs font-medium text-destructive">{t("loans.daysLate", { count: Math.max(1, -differenceInCalendarDays(l.dueAt, new Date())) })}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.recentActivity")}</CardTitle>
            <CardDescription>{t("dashboard.atLibrary", { library: user.library.name })}</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/activity">{t("dashboard.viewAll")}</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {recent.map((a) => (
                <li key={a.id} className="text-sm">
                  <p className="line-clamp-2">{renderStored(i18n, a.i18n, a.message)}</p>
                  <p className="text-xs text-muted-foreground">{relative(a.createdAt)}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

async function Discover({ libraryId }: { libraryId: string }) {
  const { t } = await getI18n();
  const [newest, popular] = await Promise.all([searchBooks({ libraryId, sort: "newest", limit: 5 }), searchBooks({ libraryId, sort: "rating", limit: 5 })]);
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-semibold">{t("dashboard.highestRated")}</h2>
          <Link href="/books?sort=rating" className="flex items-center gap-1 text-sm text-primary hover:underline">
            {t("dashboard.seeAll")} <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <BookGrid books={popular} />
      </section>
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-semibold">{t("dashboard.newArrivals")}</h2>
          <Link href="/books?sort=newest" className="flex items-center gap-1 text-sm text-primary hover:underline">
            {t("dashboard.seeAll")} <ArrowRight className="size-3.5" />
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
            <Sparkles className="size-5" /> {t("dashboard.askTitle")}
          </p>
          <p className="text-sm opacity-80">{t("dashboard.askBody")}</p>
        </div>
        <ArrowRight className="size-5 shrink-0 transition-transform group-hover:translate-x-1" />
      </Link>
    </div>
  );
}
