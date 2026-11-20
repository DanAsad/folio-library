// Notifications and the daily reminder job. Deliberately free of `server-only` so the seed
// script can run the same job to give the demo realistic notifications.
import { and, eq, gte, inArray, isNull, lt, lte } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { libraries, loans, notifications, users, type Notification } from "@/lib/db/schema";
import { emailConfigured, isDeliverable, sendEmail } from "@/lib/email";
import { daysLate, overdueFineCents } from "@/lib/money";
import { english, stored, type StoredText } from "@/i18n/stored";

const DAY = 24 * 60 * 60 * 1000;
/** Members get a "due soon" reminder this many days before the due date. */
export const DUE_SOON_DAYS = 2;

type Executor = Pick<DB, "insert">;
export type NewNotification = Omit<typeof notifications.$inferInsert, "id" | "createdAt" | "readAt" | "emailedAt" | "title" | "body" | "i18n"> & {
  title: StoredText;
  body: StoredText;
};

/**
 * Creates a notification unless one with the same dedupe key already exists. Title and body are
 * stored as message keys (shown in each reader's language) plus an English copy for email.
 */
export async function notify(db: Executor, { title, body, ...n }: NewNotification) {
  const [row] = await db
    .insert(notifications)
    .values({ ...n, title: english(title), body: english(body), i18n: { title, body } })
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning();
  return row as Notification | undefined;
}

/**
 * Daily job: "due soon" reminders, and overdue reminders on the first day and then weekly.
 * The dedupe key makes it safe to run as often as you like.
 */
export async function generateReminders(db: DB, now = new Date()) {
  const libs = await db.select().from(libraries);
  let created = 0;
  for (const lib of libs) {
    const open = await db.query.loans.findMany({
      where: and(eq(loans.libraryId, lib.id), isNull(loans.returnedAt), lte(loans.dueAt, new Date(now.getTime() + DUE_SOON_DAYS * DAY))),
      with: { book: { columns: { id: true, title: true } } },
    });
    for (const loan of open) {
      const href = "/loans?view=mine";
      // Due later today still counts as "due", not overdue (fines count calendar days).
      if (loan.dueAt >= now || daysLate(loan.dueAt, now) === 0) {
        const row = await notify(db, {
          userId: loan.userId,
          libraryId: lib.id,
          kind: "due_soon",
          title:
            daysLate(now, loan.dueAt) === 0
              ? stored("notify.dueToday.title", { title: loan.book.title })
              : stored("notify.dueSoon.title", { title: loan.book.title, date: loan.dueAt }),
          body: lib.finePerDayCents
            ? stored("notify.dueSoon.bodyFine", { library: lib.name, amount: { cents: lib.finePerDayCents, currency: lib.currency } })
            : stored("notify.dueSoon.body", { library: lib.name }),
          href,
          dedupeKey: `due_soon:${loan.id}:${loan.dueAt.toISOString().slice(0, 10)}`,
        });
        if (row) created++;
      } else {
        const late = daysLate(loan.dueAt, now);
        const week = Math.floor((late - 1) / 7);
        const fine = overdueFineCents(lib, loan.dueAt, now);
        const row = await notify(db, {
          userId: loan.userId,
          libraryId: lib.id,
          kind: "overdue",
          title: stored("notify.overdue.title", { title: loan.book.title, count: late }),
          body: fine
            ? stored("notify.overdue.bodyFine", { library: lib.name, amount: { cents: fine, currency: lib.currency } })
            : stored("notify.overdue.body", { library: lib.name }),
          href,
          dedupeKey: `overdue:${loan.id}:${loan.dueAt.toISOString().slice(0, 10)}:w${week}`,
        });
        if (row) created++;
      }
    }
  }
  return { created };
}

/** Emails notifications that haven't been emailed yet (only when email is configured). */
export async function deliverPendingEmails(db: DB, { since = new Date(Date.now() - 2 * DAY), limit = 100 } = {}) {
  if (!emailConfigured()) return { sent: 0, skipped: true };
  const pending = await db
    .select({ n: notifications, email: users.email, name: users.name, library: libraries.name })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .innerJoin(libraries, eq(libraries.id, notifications.libraryId))
    .where(and(isNull(notifications.emailedAt), gte(notifications.createdAt, since), eq(users.isDemo, false)))
    .limit(limit);
  const sendable = pending.filter((p) => isDeliverable(p.email));
  const appUrl = process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  const sentIds: string[] = [];
  for (const p of sendable) {
    const ok = await sendEmail({
      to: p.email,
      subject: p.n.title.replace(/[“”]/g, '"'),
      text: `Hi ${p.name?.split(" ")[0] ?? "there"},\n\n${p.n.body}\n\n${p.n.href && appUrl ? `${appUrl}${p.n.href}\n\n` : ""}${p.library}`,
    });
    if (ok) sentIds.push(p.n.id);
  }
  if (sentIds.length) await db.update(notifications).set({ emailedAt: new Date() }).where(inArray(notifications.id, sentIds));
  return { sent: sentIds.length, skipped: false };
}

/** Housekeeping: drop read notifications older than 60 days. */
export async function pruneNotifications(db: DB, now = new Date()) {
  await db.delete(notifications).where(lt(notifications.readAt, new Date(now.getTime() - 60 * DAY)));
}
