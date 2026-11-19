import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { AppShell } from "@/components/shell/app-shell";
import { getDb } from "@/lib/db/client";
import { holds, loans } from "@/lib/db/schema";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const db = await getDb();
  const staff = can(user.role, "loans:manage");

  // Little red counters in the sidebar: overdue loans (staff) or your own overdue + ready holds.
  const [[overdue], [ready]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(loans)
      .where(and(isNull(loans.returnedAt), lt(loans.dueAt, new Date()), staff ? undefined : eq(loans.userId, user.id))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(holds)
      .where(and(eq(holds.status, "ready"), eq(holds.userId, user.id))),
  ]);

  return (
    <AppShell user={user} badges={{ "/loans": overdue.n + ready.n }}>
      {children}
    </AppShell>
  );
}
