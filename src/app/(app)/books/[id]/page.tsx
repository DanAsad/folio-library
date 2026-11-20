import Link from "next/link";
import { notFound } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { ArrowLeft, CalendarClock, Hash, Languages, MapPin, Pencil, BookText, Building2, Users } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookCover } from "@/components/book-cover";
import { AvailabilityBadge, Stars } from "@/components/books/bits";
import { BookGrid } from "@/components/books/book-views";
import { getDb } from "@/lib/db/client";
import { memberships, users } from "@/lib/db/schema";
import { getBook, getSimilarBooks } from "@/lib/library";
import { can } from "@/lib/permissions";
import { getCurrentUser, requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { BookActions, CheckInButton, DeleteBookButton, MarkLostButton } from "./book-actions";
import { CopiesPanel } from "./copies-panel";
import { ReviewForm } from "./review-form";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n";

export async function generateMetadata({ params }: PageProps<"/books/[id]">) {
  const user = await getCurrentUser();
  const data = user ? await getBook(user.library.id, (await params).id) : null;
  return { title: data?.book.title ?? (await getI18n()).t("bookPage.book") };
}

export default async function BookPage({ params }: PageProps<"/books/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const data = await getBook(user.library.id, id);
  if (!data) notFound();
  const { t, date, relative, money } = await getI18n();
  const { book, activeLoans, queue, reviews, history, copies } = data;
  const lib = user.library;
  const staff = can(user.role, "loans:manage");
  const canEdit = can(user.role, "books:manage");

  const myLoan = activeLoans.find((l) => l.userId === user.id);
  const myHoldIndex = queue.findIndex((h) => h.userId === user.id);
  const myHold = myHoldIndex >= 0 ? queue[myHoldIndex] : undefined;
  const waitingAhead = myHold ? queue.slice(0, myHoldIndex).filter((h) => h.status === "waiting").length : 0;
  const myReview = reviews.find((r) => r.userId === user.id);

  const [similar, members] = await Promise.all([
    getSimilarBooks(book),
    staff
      ? getDb().then((db) =>
          db
            .select({ id: users.id, name: users.name, email: users.email })
            .from(memberships)
            .innerJoin(users, eq(users.id, memberships.userId))
            .where(eq(memberships.libraryId, lib.id))
            .orderBy(asc(users.name)),
        )
      : Promise.resolve([]),
  ]);

  const nextDue = activeLoans[0]?.dueAt;
  const meta: { icon: typeof Hash; label: MessageKey; value: string | number | null }[] = [
    { icon: Hash, label: "bookFields.isbn", value: book.isbn },
    { icon: CalendarClock, label: "bookFields.published", value: book.publishedYear },
    { icon: Building2, label: "bookFields.publisher", value: book.publisher },
    { icon: BookText, label: "bookFields.pages", value: book.pages },
    { icon: Languages, label: "bookFields.language", value: book.language },
    { icon: MapPin, label: "bookFields.shelf", value: book.location },
  ];
  const shownMeta = meta.filter((m) => m.value);

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/books">
            <ArrowLeft /> {t("nav.catalogue")}
          </Link>
        </Button>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/books/${book.id}/edit`}>
                <Pencil /> {t("common.edit")}
              </Link>
            </Button>
            <DeleteBookButton bookId={book.id} title={book.title} disabled={activeLoans.length > 0} />
          </div>
        )}
      </div>

      <div className="grid gap-8 md:grid-cols-[minmax(0,260px)_1fr] lg:gap-12">
        {/* Left column: cover + borrowing */}
        <div className="space-y-5">
          <BookCover title={book.title} author={book.author} coverUrl={book.coverUrl} size="lg" className="mx-auto w-48 md:w-full" />
          <Card className="gap-4 py-4">
            <CardContent className="space-y-4 px-4">
              <div className="flex items-center justify-between">
                <AvailabilityBadge book={book} long />
                <span className="text-xs text-muted-foreground">{t("dashboard.copiesCount", { count: book.totalCopies })}</span>
              </div>
              {book.available === 0 && nextDue && !myLoan && (
                <p className="text-xs text-muted-foreground">
                  {t("bookPage.nextDue", { when: relative(nextDue), date: nextDue })}
                </p>
              )}
              <BookActions
                bookId={book.id}
                available={book.available}
                myLoan={myLoan ? { id: myLoan.id, dueAt: myLoan.dueAt.toISOString(), renewals: myLoan.renewals } : null}
                myHold={myHold ? { id: myHold.id, status: myHold.status, expiresAt: myHold.expiresAt?.toISOString() ?? null, position: waitingAhead + 1 } : null}
                staff={staff}
                members={members.map((m) => ({ id: m.id, name: m.name ?? m.email, email: m.email }))}
                freeCopies={copies.filter((c) => c.status === "active" && !c.loan).map((c) => c.barcode)}
                loanDays={lib.loanDays}
                maxRenewals={lib.maxRenewals}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right column: details */}
        <div className="min-w-0 space-y-8">
          <div className="space-y-3">
            {book.genre && (
              <Link href={`/books?genre=${encodeURIComponent(book.genre)}`} className="text-sm font-medium text-primary hover:underline">
                {book.genre}
              </Link>
            )}
            <h1 className="text-4xl leading-tight font-semibold text-balance">{book.title}</h1>
            <p className="text-lg text-muted-foreground">
              {t("bookPage.by")}{" "}
              <Link href={`/books?q=${encodeURIComponent(book.author)}&field=author`} className="text-foreground hover:text-primary hover:underline">
                {book.author}
              </Link>
            </p>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <Stars value={book.avgRating} count={book.reviewCount} size="md" />
              <span className="flex items-center gap-1.5">
                <Users className="size-4" /> {t("bookPage.borrowedTimes", { count: book.loanCount })}
              </span>
            </div>
          </div>

          {book.description && <p className="max-w-prose text-[1.05rem] leading-relaxed">{book.description}</p>}

          {book.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {book.tags.map((tag) => (
                <Badge key={tag} variant="secondary" asChild>
                  <Link href={`/books?q=${encodeURIComponent(tag)}&field=tags`}>#{tag}</Link>
                </Badge>
              ))}
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border bg-card p-5 sm:grid-cols-3">
            {shownMeta.map(({ icon: Icon, label, value }) => (
              <div key={label} className="space-y-1">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Icon className="size-3.5" /> {t(label)}
                </dt>
                <dd className={cn("text-sm font-medium", label === "bookFields.isbn" && "font-mono")}>{value}</dd>
              </div>
            ))}
          </dl>

          <Tabs defaultValue="reviews">
            <TabsList>
              <TabsTrigger value="reviews">{t("bookPage.reviewsTab", { count: reviews.length })}</TabsTrigger>
              <TabsTrigger value="waitlist">{t("bookPage.waitlistTab", { count: queue.length })}</TabsTrigger>
              {staff && <TabsTrigger value="copies">{t("bookPage.copiesTab", { count: copies.filter((c) => c.status === "active").length })}</TabsTrigger>}
              {staff && <TabsTrigger value="loans">{t("bookPage.onLoanTab", { count: activeLoans.length })}</TabsTrigger>}
              {staff && <TabsTrigger value="history">{t("bookPage.historyTab")}</TabsTrigger>}
            </TabsList>

            <TabsContent value="reviews" className="space-y-5 pt-4">
              <ReviewForm bookId={book.id} existing={myReview ? { rating: myReview.rating, body: myReview.body ?? "" } : null} />
              {reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("bookPage.noReviews")}</p>
              ) : (
                <ul className="divide-y rounded-xl border bg-card">
                  {reviews.map((r) => (
                    <li key={r.id} className="space-y-1.5 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{r.user.name}</span>
                        <span className="text-xs text-muted-foreground">{date(r.createdAt, "medium")}</span>
                      </div>
                      <Stars value={r.rating} />
                      {r.body && <p className="text-sm text-muted-foreground">{r.body}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="waitlist" className="pt-4">
              {queue.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("bookPage.nobodyWaiting")}</p>
              ) : (
                <ol className="divide-y rounded-xl border bg-card">
                  {queue.map((h, i) => (
                    <li key={h.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                      <span className="flex items-center gap-3">
                        <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">{i + 1}</span>
                        {staff || h.userId === user.id ? h.user.name ?? h.user.email : t("bookPage.aMember")}
                        {h.userId === user.id && <Badge variant="secondary">{t("bookPage.you")}</Badge>}
                      </span>
                      {h.status === "ready" ? (
                        <Badge className="bg-success/15 text-success">{h.expiresAt ? t("bookPage.readyUntil", { date: h.expiresAt }) : t("bookPage.readySoon")}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("bookPage.joined", { when: relative(h.createdAt) })}</span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </TabsContent>

            {staff && (
              <TabsContent value="copies" className="pt-4">
                <CopiesPanel
                  bookId={book.id}
                  canEdit={canEdit}
                  copies={copies.map((c) => ({
                    id: c.id,
                    barcode: c.barcode,
                    condition: c.condition,
                    status: c.status,
                    note: c.note,
                    acquiredAt: c.acquiredAt.toISOString(),
                    loan: c.loan ? { member: c.loan.user.name ?? c.loan.user.email, dueAt: c.loan.dueAt.toISOString() } : null,
                  }))}
                />
              </TabsContent>
            )}

            {staff && (
              <TabsContent value="loans" className="pt-4">
                {activeLoans.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("bookPage.allOnShelf")}</p>
                ) : (
                  <ul className="divide-y rounded-xl border bg-card">
                    {activeLoans.map((l) => {
                      const overdue = l.dueAt < new Date();
                      return (
                        <li key={l.id} className="flex items-center justify-between gap-3 p-4 text-sm">
                          <div>
                            <p className="font-medium">
                              {l.user.name ?? l.user.email} <span className="font-mono text-xs font-normal text-muted-foreground">{l.copy.barcode}</span>
                            </p>
                            <p className={cn("text-xs", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                              {overdue
                                ? t("loans.overdueByDays", { count: Math.max(1, -differenceInCalendarDays(l.dueAt, new Date())) })
                                : t("loans.dueOn", { date: l.dueAt })}{" "}
                              · {t("bookPage.borrowedOn", { date: l.borrowedAt })}
                            </p>
                          </div>
                          <div className="flex gap-1">
                            <MarkLostButton loanId={l.id} barcode={l.copy.barcode} fee={money(lib.lostItemFeeCents, lib.currency)} />
                            <CheckInButton loanId={l.id} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </TabsContent>
            )}

            {staff && (
              <TabsContent value="history" className="pt-4">
                <ul className="divide-y rounded-xl border bg-card text-sm">
                  {history.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <span>
                        {l.user.name} <span className="font-mono text-xs text-muted-foreground">{l.copy.barcode}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {date(l.borrowedAt)} → {l.returnedAt ? date(l.returnedAt) : t("catalogue.now")}
                      </span>
                    </li>
                  ))}
                </ul>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>

      {similar.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">{t("bookPage.moreLikeThis")}</h2>
          <BookGrid books={similar.slice(0, 5)} />
        </section>
      )}
    </div>
  );
}
