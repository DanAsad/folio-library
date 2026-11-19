import Link from "next/link";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { format } from "date-fns";
import { ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/books/bits";
import { initials } from "@/lib/format";
import { getDb } from "@/lib/db/client";
import { fines, memberships, users } from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";
import { can, PERMISSIONS, ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/permissions";
import { requirePermissionPage } from "@/lib/session";
import { cn } from "@/lib/utils";
import { AddPersonDialog, ChargeFineDialog, FineButtons } from "./member-tools";
import { RoleSelect } from "./role-select";

export const metadata = { title: "Members & fines" };

export default async function MembersPage() {
  const me = await requirePermissionPage("loans:manage");
  const lib = me.library;
  const isAdmin = can(me.role, "users:manage");
  const canFine = can(me.role, "fines:manage");
  const db = await getDb();

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
        title="Members & fines"
        description={`Everyone with access to ${lib.name}. ${isAdmin ? "Roles apply to this library only and change immediately." : "Only admins can change roles."}`}
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
              <ShieldCheck className="size-4 text-primary" /> {ROLE_LABEL[r]}
              <span className="ml-auto text-xs font-normal text-muted-foreground">{rows.filter((x) => x.role === r).length}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{ROLE_DESCRIPTION[r]}</p>
            <p className="mt-2 flex flex-wrap gap-1">
              {Object.entries(PERMISSIONS)
                .filter(([, roles]) => (roles as readonly string[]).includes(r))
                .map(([p]) => (
                  <code key={p} className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem]">
                    {p}
                  </code>
                ))}
              <code className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem]">borrow & review</code>
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">On loan</TableHead>
              <TableHead className="text-right">Owes</TableHead>
              <TableHead className="hidden text-right sm:table-cell">All-time loans</TableHead>
              <TableHead className="hidden md:table-cell">Joined</TableHead>
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
                        {u.id === me.id && <Badge variant="secondary">You</Badge>}
                        {u.isDemo && <Badge variant="outline">Demo</Badge>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {isAdmin && u.id !== me.id ? <RoleSelect userId={u.id} role={u.role} /> : <Badge variant="secondary">{ROLE_LABEL[u.role]}</Badge>}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {u.active}
                  {u.overdue > 0 && <span className="ml-2 text-xs font-medium text-destructive">{u.overdue} overdue</span>}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    u.owed > 0 ? (lib.blockAtCents > 0 && u.owed >= lib.blockAtCents ? "font-medium text-destructive" : "font-medium") : "text-muted-foreground",
                  )}
                >
                  {u.owed > 0 ? formatMoney(u.owed, lib.currency) : "—"}
                </TableCell>
                <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">{u.total}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{format(u.joinedAt, "MMM d, yyyy")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <section className="mt-10 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold">Unpaid fines</h2>
            <p className="text-sm text-muted-foreground">
              {formatMoney(totalOwed, lib.currency)} outstanding.{" "}
              {lib.finePerDayCents
                ? `Late fees are ${formatMoney(lib.finePerDayCents, lib.currency)} a day${lib.fineGraceDays ? ` after ${lib.fineGraceDays} grace days` : ""}${lib.maxFineCents ? `, capped at ${formatMoney(lib.maxFineCents, lib.currency)} per loan` : ""}.`
                : "This library doesn't charge late fees."}
              {lib.blockAtCents ? ` Members owing ${formatMoney(lib.blockAtCents, lib.currency)} or more can't borrow.` : ""}
              {can(me.role, "settings:manage") && (
                <>
                  {" "}
                  <Link href="/settings" className="text-primary hover:underline">
                    Change the rules
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>
        {openFines.length === 0 ? (
          <p className="rounded-xl border bg-card px-4 py-6 text-center text-sm text-muted-foreground">Nobody owes anything right now.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Member</TableHead>
                  <TableHead>For</TableHead>
                  <TableHead className="hidden md:table-cell">Charged</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {canFine && <TableHead className="text-right">Settle</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {openFines.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.user.name ?? f.user.email}</TableCell>
                    <TableCell className="text-sm">
                      <span className="capitalize">{f.reason === "overdue" ? "Late return" : f.reason === "lost" ? "Lost item" : "Damage"}</span>
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
                    <TableCell className="hidden text-muted-foreground md:table-cell">{format(f.createdAt, "MMM d")}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatMoney(f.amountCents, lib.currency)}</TableCell>
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
