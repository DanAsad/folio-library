import { NextResponse } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { DEMO_MODE } from "@/auth";
import { getDb } from "@/lib/db/client";
import { holds } from "@/lib/db/schema";
import { seed } from "@/lib/db/seed";
import { processHoldQueue } from "@/lib/library";
import { deliverPendingEmails, generateReminders, pruneNotifications } from "@/lib/reminders";

export const maxDuration = 60;

/**
 * Daily job, triggered by Vercel Cron (see vercel.json) at 04:00 UTC.
 *  1. Demo deployments: restore the sample data so every reviewer starts clean.
 *  2. Expire reservations nobody picked up and pass the copy to the next person.
 *  3. Create "due soon" and overdue reminders, then email them if email is configured.
 * Vercel sends `Authorization: Bearer $CRON_SECRET`; anything else is rejected.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const result: Record<string, unknown> = {};

  if (DEMO_MODE && process.env.DEMO_RESET !== "false") {
    result.demoReset = await seed(db, { reset: true });
  }

  const stale = await db
    .selectDistinct({ bookId: holds.bookId })
    .from(holds)
    .where(and(eq(holds.status, "ready"), lt(holds.expiresAt, new Date())));
  for (const { bookId } of stale) await processHoldQueue(db, bookId);
  result.expiredHoldsProcessed = stale.length;

  result.reminders = await generateReminders(db);
  result.emails = await deliverPendingEmails(db);
  await pruneNotifications(db);

  return NextResponse.json({ ok: true, ...result });
}
