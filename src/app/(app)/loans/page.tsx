import Link from "next/link";
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { differenceInCalendarDays, format, formatDistanceToNowStrict } from "date-fns";
import { BookMarked, Clock, History, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BookCover } from "@/components/book-cover";
import { EmptyState, PageHeader } from "@/components/books/bits";
import { getDb } from "@/lib/db/client";
import { fines, holds, loans } from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { BorrowReservedButton, CancelHoldButton, CheckInButton, MarkLostButton, RenewButton } from "../books/[id]/book-actions";
import { DeskCheckIn } from "./desk-check-in";

export const metadata = { title: "Loans & holds" };

function DueLabel({ dueAt }: { dueAt: Date }) {
  const days = differenceInCalendarDays(dueAt, new Date());
  if (days < 0) return <span className="font-medium text-destructive">Overdue by {formatDistanceToNowStrict(dueAt)}</span>;
  if (days === 0) return <span className="font-medium text-warning">Due today</span>;
  if (days <= 3) return <span className="font-medium text-[color-mix(in_oklch,var(--warning),black_20%)] dark:text-warning">Due in {days} day{days > 1 ? "s" : ""}</span>;
  return <span className="text-muted-foreground">Due {format(dueAt, "MMM d")}</span>;
}

/** Share of the loan period that has passed, 0-100. */
function loanProgress(borrowedAt: Date, dueAt: Date) {
  const total = dueAt.getTime() - borrowedAt.getTime();
  const elapsed = Math.min(Math.max(Date.now() - borrowedAt.getTime(), 0), total);
  return total > 0 ? (elapsed / total) * 100 : 100;
}

export default async function LoansPage({ searchParams }: PageProps<"/loans">) {
  const user = await requireUser();
  const sp = await searchParams;
  const staff = can(user.role, "loans:manage");
  const view = staff && sp.view !== "mine" ? "desk" : "mine";
  const overdueOnly = sp.filter === "overdue";
  const db = await getDb();
  const lib = user.library;

  const [myLoans, myHolds, myHistory, myFines] = await Promise.all([
    db.query.loans.findMany({
      where: and(eq(loans.libraryId, lib.id), eq(loans.userId, user.id), isNull(loans.returnedAt)),
      with: { book: true, copy: { columns: { barcode: true } } },
      orderBy: asc(loans.dueAt),
    }),
    db.query.holds.findMany({
      where: and(eq(holds.libraryId, lib.id), eq(holds.userId, user.id), inArray(holds.status, ["waiting", "ready"])),
      with: { book: true },
      orderBy: asc(holds.createdAt),
    }),
    db.query.loans.findMany({
      where: and(eq(loans.libraryId, lib.id), eq(loans.userId, user.id), isNotNull(loans.returnedAt)),
      with: { book: true },
      orderBy: desc(loans.returnedAt),
      limit: 12,
    }),
    db.query.fines.findMany({
      where: and(eq(fines.libraryId, lib.id), eq(fines.userId, user.id)),
      with: { loan: { with: { book: { columns: { title: true } } } } },
      orderBy: [sql`case when ${fines.status} = 'open' then 0 else 1 end`, desc(fines.createdAt)],
      limit: 10,
    }),
  ]);

  const tabs = staff && (
    <div className="flex rounded-lg border bg-card p-1 text-sm">
      {[
        ["desk", "Circulation desk"],
        ["mine", "My loans"],
      ].map(([key, label]) => (
        <Link
          key={key}
          href={key === "desk" ? "/loans" : "/loans?view=mine"}
          className={cn("rounded-md px-3 py-1.5 font-medium", view === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {label}
        </Link>
      ))}
    </div>
  );

  if (view === "desk") {
    const [active, queue] = await Promise.all([
      db.query.loans.findMany({
        where: and(eq(loans.libraryId, lib.id), isNull(loans.returnedAt), overdueOnly ? lt(loans.dueAt, new Date()) : undefined),
        with: { book: true, user: true, copy: { columns: { barcode: true } } },
        orderBy: asc(loans.dueAt),
      }),
      db.query.holds.findMany({
        where: and(eq(holds.libraryId, lib.id), inArray(holds.status, ["waiting", "ready"])),
        with: { book: true, user: true },
        orderBy: asc(holds.createdAt),
      }),
    ]);
    const overdueCount = active.filter((l) => l.dueAt < new Date()).length;

    return (
      <>
        <PageHeader title="Loans & holds" description={`Everything that's out, due back, or waiting to be picked up at ${lib.name}.`} actions={tabs} />
        <DeskCheckIn example={active[0]?.copy.barcode} />
        <div className="mb-4 flex gap-2 text-sm">
          <Link href="/loans" className={cn("rounded-full border px-3 py-1", !overdueOnly && "border-primary bg-accent text-accent-foreground")}>
            All active
          </Link>
          <Link href="/loans?filter=overdue" className={cn("rounded-full border px-3 py-1", overdueOnly && "border-destructive bg-destructive/10 text-destructive")}>
            Overdue{overdueCount ? ` (${overdueCount})` : ""}
          </Link>
        </div>
        {active.length === 0 ? (
          <EmptyState icon={<BookMarked className="size-5" />} title={overdueOnly ? "Nothing overdue" : "No active loans"}>
            {overdueOnly ? "Every borrowed book is on time. 🎉" : "Books you check out to members will show up here."}
          </EmptyState>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Book</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead className="hidden md:table-cell">Borrowed</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.map((l) => (
                  <TableRow key={l.id} className={cn(l.dueAt < new Date() && "bg-destructive/[0.04]")}>
                    <TableCell>
                      <Link href={`/books/${l.book.id}`} className="flex items-center gap-3 hover:text-primary">
                        <BookCover title={l.book.title} author={l.book.author} coverUrl={l.book.coverUrl} size="sm" className="w-8 shrink-0" />
                        <span className="min-w-0">
                          <span className="block max-w-56 truncate font-medium">{l.book.title}</span>
                          <span className="font-mono text-xs text-muted-foreground">{l.copy.barcode}</span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>{l.user.name ?? l.user.email}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{format(l.borrowedAt, "MMM d")}</TableCell>
                    <TableCell>
                      <DueLabel dueAt={l.dueAt} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <RenewButton loanId={l.id} disabled={l.renewals >= lib.maxRenewals} />
                        {l.dueAt < new Date() && <MarkLostButton loanId={l.id} barcode={l.copy.barcode} fee={formatMoney(lib.lostItemFeeCents, lib.currency)} />}
                        <CheckInButton loanId={l.id} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <h2 className="mt-10 mb-4 text-xl font-semibold">Waitlists</h2>
        {queue.length === 0 ? (
          <p className="text-sm text-muted-foreground">No one is waiting for a book.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableBody>
                {queue.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>
                      <Link href={`/books/${h.book.id}`} className="font-medium hover:text-primary">
                        {h.book.title}
                      </Link>
                    </TableCell>
                    <TableCell>{h.user.name ?? h.user.email}</TableCell>
                    <TableCell>
                      {h.status === "ready" ? (
                        <Badge className="bg-success/15 text-success">Ready for pickup until {h.expiresAt ? format(h.expiresAt, "MMM d") : "soon"}</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">Waiting since {format(h.createdAt, "MMM d")}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <CancelHoldButton holdId={h.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </>
    );
  }

  // Member view
  const owed = myFines.filter((f) => f.status === "open").reduce((sum, f) => sum + f.amountCents, 0);
  return (
    <>
      <PageHeader title="My loans" description={`At ${lib.name}, loans last ${lib.loanDays} days and can be renewed up to ${lib.maxRenewals} times.${lib.finePerDayCents ? ` Late returns cost ${formatMoney(lib.finePerDayCents, lib.currency)} a day${lib.fineGraceDays ? ` after ${lib.fineGraceDays} grace days` : ""}.` : ""}`} actions={tabs} />
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <BookMarked className="size-5 text-primary" /> Currently borrowed
        </h2>
        {myLoans.length === 0 ? (
          <EmptyState icon={<BookMarked className="size-5" />} title="Nothing borrowed right now">
            Browse the <Link href="/books" className="text-primary underline">catalogue</Link> or ask the{" "}
            <Link href="/assistant" className="text-primary underline">AI librarian</Link> for ideas.
          </EmptyState>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {myLoans.map((l) => {
              const overdue = l.dueAt < new Date();
              return (
                <Card key={l.id} className={cn("py-4", overdue && "border-destructive/40")}>
                  <CardContent className="flex gap-4 px-4">
                    <Link href={`/books/${l.book.id}`}>
                      <BookCover title={l.book.title} author={l.book.author} coverUrl={l.book.coverUrl} size="sm" className="w-16 shrink-0" />
                    </Link>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div>
                        <Link href={`/books/${l.book.id}`} className="line-clamp-1 font-medium hover:text-primary">
                          {l.book.title}
                        </Link>
                        <p className="text-sm text-muted-foreground">{l.book.author}</p>
                      </div>
                      <Progress value={loanProgress(l.borrowedAt, l.dueAt)} className={cn("h-1.5", overdue && "[&>div]:bg-destructive")} />
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <DueLabel dueAt={l.dueAt} />
                        <div className="flex gap-1">
                          <RenewButton loanId={l.id} disabled={l.renewals >= lib.maxRenewals} />
                          <CheckInButton loanId={l.id} label="Return" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Clock className="size-5 text-primary" /> Waitlist & reservations
        </h2>
        {myHolds.length === 0 ? (
          <p className="text-sm text-muted-foreground">You&apos;re not waiting for any books. When a book is fully checked out, you can join its waitlist.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {myHolds.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <Link href={`/books/${h.book.id}`} className="flex items-center gap-3 font-medium hover:text-primary">
                  <BookCover title={h.book.title} author={h.book.author} coverUrl={h.book.coverUrl} size="sm" className="w-9" />
                  {h.book.title}
                </Link>
                <div className="flex items-center gap-2">
                  {h.status === "ready" ? (
                    <>
                      <Badge className="bg-success/15 text-success">Reserved for you until {h.expiresAt ? format(h.expiresAt, "MMM d") : "soon"}</Badge>
                      <BorrowReservedButton bookId={h.book.id} />
                    </>
                  ) : (
                    <Badge variant="secondary">Waiting since {format(h.createdAt, "MMM d")}</Badge>
                  )}
                  <CancelHoldButton holdId={h.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="fines" className="mt-10 scroll-mt-20 space-y-4">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Receipt className="size-5 text-primary" /> Fines
          {owed > 0 && (
            <Badge variant="outline" className="border-destructive/40 text-destructive">
              {formatMoney(owed, lib.currency)} owed
            </Badge>
          )}
        </h2>
        {myFines.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fines. Thanks for bringing books back on time!</p>
        ) : (
          <>
            {lib.blockAtCents > 0 && owed >= lib.blockAtCents && (
              <p className="rounded-lg border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm">
                Borrowing is paused while you owe {formatMoney(lib.blockAtCents, lib.currency)} or more. Fines can be paid at the {lib.name} desk.
              </p>
            )}
            <ul className="divide-y rounded-xl border bg-card text-sm">
              {myFines.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block font-medium capitalize">
                      {f.reason === "overdue" ? "Late return" : f.reason === "lost" ? "Lost book" : "Damage"}
                      {f.loan?.book ? <span className="font-normal normal-case text-muted-foreground"> · {f.loan.book.title}</span> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(f.createdAt, "MMM d, yyyy")}
                      {f.note ? ` · ${f.note}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-medium tabular-nums">{formatMoney(f.amountCents, lib.currency)}</span>
                    <Badge
                      variant={f.status === "open" ? "outline" : "secondary"}
                      className={cn("capitalize", f.status === "open" && "border-destructive/40 text-destructive")}
                    >
                      {f.status === "open" ? "Unpaid" : f.status}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="mt-10 space-y-4">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <History className="size-5 text-primary" /> Reading history
        </h2>
        {myHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">Books you return will appear here.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
            {myHistory.map((l) => (
              <li key={l.id}>
                <Link href={`/books/${l.book.id}`} className="group block space-y-1.5">
                  <BookCover title={l.book.title} author={l.book.author} coverUrl={l.book.coverUrl} size="sm" />
                  <p className="line-clamp-1 text-xs font-medium group-hover:text-primary">{l.book.title}</p>
                  <p className="text-[0.7rem] text-muted-foreground">Returned {format(l.returnedAt!, "MMM d")}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
