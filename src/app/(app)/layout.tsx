import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { AppShell } from "@/components/shell/app-shell";
import { getDb } from "@/lib/db/client";
import { holds, libraries, loans, notifications } from "@/lib/db/schema";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { getI18n } from "@/i18n/server";
import { renderStored } from "@/i18n/stored";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const db = await getDb();
  const i18n = await getI18n();
  const staff = can(user.role, "loans:manage");
  const lib = user.library.id;

  // Little red counters in the sidebar: overdue loans (staff) or your own overdue + ready holds.
  const [[overdue], [ready], recent, [{ unread }]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(loans)
      .where(and(eq(loans.libraryId, lib), isNull(loans.returnedAt), lt(loans.dueAt, new Date()), staff ? undefined : eq(loans.userId, user.id))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(holds)
      .where(and(eq(holds.libraryId, lib), eq(holds.status, "ready"), eq(holds.userId, user.id))),
    db
      .select({ n: notifications, library: libraries.name })
      .from(notifications)
      .innerJoin(libraries, eq(libraries.id, notifications.libraryId))
      .where(eq(notifications.userId, user.id))
      .orderBy(sql`${notifications.readAt} is not null`, desc(notifications.createdAt))
      .limit(15),
    db
      .select({ unread: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt))),
  ]);

  return (
    <AppShell
      user={user}
      badges={{ "/loans": overdue.n + ready.n }}
      notifications={{
        unread,
        items: recent.map(({ n, library }) => ({
          id: n.id,
          kind: n.kind,
          title: renderStored(i18n, n.i18n?.title, n.title),
          body: renderStored(i18n, n.i18n?.body, n.body),
          href: n.href,
          library,
          libraryId: n.libraryId,
          read: Boolean(n.readAt),
          createdAt: n.createdAt.toISOString(),
        })),
      }}
    >
      {children}
    </AppShell>
  );
}
