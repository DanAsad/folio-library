import Link from "next/link";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/books/bits";
import { initials } from "@/lib/format";
import { getDb } from "@/lib/db/client";
import { fines, memberships, users } from "@/lib/db/schema";
import { can, PERMISSIONS } from "@/lib/permissions";
import { requirePermissionPage } from "@/lib/session";
import { cn } from "@/lib/utils";
import { AddPersonDialog, ChargeFineDialog, FineButtons } from "./member-tools";
import { RoleSelect } from "./role-select";
import { getI18n } from "@/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("nav.members") };
}

export default async function MembersPage() {
  const me = await requirePermissionPage("loans:manage");
  const lib = me.library;
  const isAdmin = can(me.role, "users:manage");
  const canFine = can(me.role, "fines:manage");
  const db = await getDb();
  const { t, money, date } = await getI18n();
  const m = (cents: number) => money(cents, lib.currency);

  // Fully qualified on purpose (see the note in lib/library.ts), and scoped to this library.
  const activeSql = sql<number>`(select count(*)::int from loans l where l.user_id = "users"."id" and l.library_id = ${lib.id} and l.returned_at is null)`;
  const overdueSql = sql<number>`(select count(*)::int from loans l where l.user_id = "users"."id" and l.library_id = ${lib.id} and l.returned_at is null and l.due_at < now())`;
  const totalSql = sql<number>`(select count(*)::int from loans l where l.user_id = "users"."id" and l.library_id = ${lib.id})`;
  const owedSql = sql<number>`(select coalesce(sum(f.amount_cents), 0)::int from fines f where f.user_id = "users"."id" and f.library_id = ${lib.id} and f.status = 'open')`;

  const [rows, openFines] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        role: memberships.role,
        isDemo: users.isDemo,
        joinedAt: memberships.createdAt,
        active: activeSql,
        overdue: overdueSql,
        total: totalSql,
        owed: owedSql,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.libraryId, lib.id))
      .orderBy(sql`case ${memberships.role} when 'admin' then 0 when 'librarian' then 1 else 2 end`, asc(users.name)),
    db.query.fines.findMany({
      where: and(eq(fines.libraryId, lib.id), eq(fines.status, "open")),
      with: { user: { columns: { name: true, email: true } }, loan: { with: { book: { columns: { id: true, title: true } } } } },
      orderBy: desc(fines.createdAt),
    }),
  ]);
  const totalOwed = openFines.reduce((s, f) => s + f.amountCents, 0);

  return (
    <>
      <PageHeader
        title={t("nav.members")}
        description={`${t("members.description", { library: lib.name })} ${isAdmin ? t("members.rolesNote") : t("members.adminsOnly")}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {canFine && <ChargeFineDialog currency={lib.currency} members={rows.map((r) => ({ id: r.id, name: r.name ?? r.email }))} />}
            {isAdmin && <AddPersonDialog libraryName={lib.name} />}
          </div>
        }
      />

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {(["admin", "librarian", "member"] as const).map((r) => (
          <div key={r} className="rounded-xl border bg-card p-4">
            <p className="flex items-center gap-2 font-medium">
              <ShieldCheck className="size-4 text-primary" /> {t(`roles.${r}`)}
              <span className="ml-auto text-xs font-normal text-muted-foreground">{rows.filter((x) => x.role === r).length}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t(`roleDescriptions.${r}`)}</p>
            <p className="mt-2 flex flex-wrap gap-1">
              {Object.entries(PERMISSIONS)
                .filter(([, roles]) => (roles as readonly string[]).includes(r))
                .map(([p]) => (
                  <code key={p} className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem]">
                    {p}
                  </code>
                ))}
              <code className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem]">{t("members.borrowReview")}</code>
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>{t("members.name")}</TableHead>
              <TableHead>{t("members.role")}</TableHead>
              <TableHead className="text-right">{t("books.onLoan")}</TableHead>
              <TableHead className="text-right">{t("members.owes")}</TableHead>
              <TableHead className="hidden text-right sm:table-cell">{t("members.allTime")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("members.joined")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      {u.image && <AvatarImage src={u.image} alt="" />}
                      <AvatarFallback className="bg-accent text-xs text-accent-foreground">{initials(u.name ?? u.email)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate font-medium">
                        {u.name ?? "—"}
                        {u.id === me.id && <Badge variant="secondary">{t("bookPage.you")}</Badge>}
                        {u.isDemo && <Badge variant="outline">{t("members.demo")}</Badge>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {isAdmin && u.id !== me.id ? <RoleSelect userId={u.id} role={u.role} /> : <Badge variant="secondary">{t(`roles.${u.role}`)}</Badge>}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {u.active}
                  {u.overdue > 0 && <span className="ml-2 text-xs font-medium text-destructive">{t("dashboard.overdueCount", { count: u.overdue })}</span>}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    u.owed > 0 ? (lib.blockAtCents > 0 && u.owed >= lib.blockAtCents ? "font-medium text-destructive" : "font-medium") : "text-muted-foreground",
                  )}
                >
                  {u.owed > 0 ? m(u.owed) : "—"}
                </TableCell>
                <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">{u.total}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{date(u.joinedAt, "medium")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <section className="mt-10 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold">{t("members.unpaid")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("members.outstanding", { amount: m(totalOwed) })}{" "}
              {lib.finePerDayCents
                ? [
                    t("members.lateFees", { amount: m(lib.finePerDayCents) }),
                    lib.fineGraceDays ? t("members.graceDays", { count: lib.fineGraceDays }) : "",
                    lib.maxFineCents ? t("members.cap", { amount: m(lib.maxFineCents) }) : "",
                  ]
                    .filter(Boolean)
                    .join(" ")
                : t("members.noLateFees")}
              {lib.blockAtCents ? ` ${t("members.blockAt", { amount: m(lib.blockAtCents) })}` : ""}
              {can(me.role, "settings:manage") && (
                <>
                  {" "}
                  <Link href="/settings" className="text-primary hover:underline">
                    {t("members.changeRules")}
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
        {openFines.length === 0 ? (
          <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">{t("members.nobodyOwes")}</p>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>{t("loansPage.member")}</TableHead>
                  <TableHead>{t("members.for")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("members.charged")}</TableHead>
                  <TableHead className="text-right">{t("fields.amount")}</TableHead>
                  {canFine && <TableHead className="text-right">{t("members.settle")}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {openFines.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.user.name ?? f.user.email}</TableCell>
                    <TableCell className="text-sm">
                      <span>{t(`fineReasons.${f.reason}`)}</span>
                      {f.loan?.book && (
                        <>
                          {" · "}
                          <Link href={`/books/${f.loan.book.id}`} className="text-muted-foreground hover:text-primary">
                            {f.loan.book.title}
                          </Link>
                        </>
                      )}
                      {f.note && <p className="text-xs text-muted-foreground">{f.note}</p>}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{date(f.createdAt)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{m(f.amountCents)}</TableCell>
                    {canFine && (
                      <TableCell>
                        <FineButtons fineId={f.id} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </>
  );
}
