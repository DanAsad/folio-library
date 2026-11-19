import { asc, sql } from "drizzle-orm";
import { format } from "date-fns";
import { ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/books/bits";
import { initials } from "@/lib/format";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { can, PERMISSIONS, ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/permissions";
import { requirePermissionPage } from "@/lib/session";
import { RoleSelect } from "./role-select";

export const metadata = { title: "Members" };

export default async function MembersPage() {
  const me = await requirePermissionPage("loans:manage");
  const isAdmin = can(me.role, "users:manage");
  const db = await getDb();

  // Fully qualified on purpose (see the note in lib/library.ts).
  const activeSql = sql<number>`(select count(*)::int from loans l where l.user_id = "users"."id" and l.returned_at is null)`;
  const overdueSql = sql<number>`(select count(*)::int from loans l where l.user_id = "users"."id" and l.returned_at is null and l.due_at < now())`;
  const totalSql = sql<number>`(select count(*)::int from loans l where l.user_id = "users"."id")`;
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, image: users.image, role: users.role, isDemo: users.isDemo, createdAt: users.createdAt, active: activeSql, overdue: overdueSql, total: totalSql })
    .from(users)
    .orderBy(sql`case ${users.role} when 'admin' then 0 when 'librarian' then 1 else 2 end`, asc(users.name));

  return (
    <>
      <PageHeader
        title="Members"
        description={isAdmin ? "Manage who can do what. Role changes apply immediately." : "Everyone with a library account. Only admins can change roles."}
      />

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {(["admin", "librarian", "member"] as const).map((r) => (
          <div key={r} className="rounded-xl border bg-card p-4">
            <p className="flex items-center gap-2 font-medium">
              <ShieldCheck className="size-4 text-primary" /> {ROLE_LABEL[r]}
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
                <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">{u.total}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{format(u.createdAt, "MMM d, yyyy")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
