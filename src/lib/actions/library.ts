"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { DEMO_MODE } from "@/auth";
import { getDb } from "@/lib/db/client";
import { activity, libraries, memberships, notifications } from "@/lib/db/schema";
import { seed } from "@/lib/db/seed";
import { LibraryError } from "@/lib/library";
import { ActionError, authorize } from "@/lib/session";
import { LIBRARY_COOKIE } from "@/lib/tenancy";
import { librarySettingsInput, newLibraryInput } from "@/lib/validation";
import { getI18n } from "@/i18n/server";
import { activityText } from "@/i18n/stored";
import { run } from "./result";

const ONE_YEAR = 60 * 60 * 24 * 365;

async function rememberLibrary(id: string) {
  (await cookies()).set(LIBRARY_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: ONE_YEAR });
}

/** Switch the library you're working in. Only libraries you belong to can be chosen. */
export async function switchLibrary(libraryId: string) {
  return run(async () => {
    const user = await authorize();
    const target = user.libraries.find((l) => l.id === libraryId);
    if (!target) throw new ActionError("errors.youNotMember");
    await rememberLibrary(libraryId);
    revalidatePath("/", "layout");
    const { t } = await getI18n();
    return { message: t("actions.switched", { library: target.name }) };
  });
}

export async function updateLibrarySettings(input: z.input<typeof librarySettingsInput>) {
  return run(async () => {
    const user = await authorize("settings:manage");
    const d = librarySettingsInput.parse(input);
    const db = await getDb();
    await db
      .update(libraries)
      .set({
        name: d.name,
        tagline: d.tagline,
        loanDays: d.loanDays,
        maxLoans: d.maxLoans,
        maxRenewals: d.maxRenewals,
        holdPickupDays: d.holdPickupDays,
        finePerDayCents: d.finePerDay,
        fineGraceDays: d.fineGraceDays,
        maxFineCents: d.maxFine,
        lostItemFeeCents: d.lostItemFee,
        blockAtCents: d.blockAt,
        currency: d.currency,
      })
      .where(eq(libraries.id, user.library.id));
    await db.insert(activity).values({
      libraryId: user.library.id,
      actorId: user.id,
      action: "library.settings",
      ...activityText("activity.librarySettings", { member: user.name, days: d.loanDays, books: d.maxLoans, renewals: d.maxRenewals }),
    });
    revalidatePath("/", "layout");
    const { t } = await getI18n();
    return { message: t("actions.settingsSaved") };
  });
}

/** Creates a new library (tenant). The creator becomes its admin and switches to it. */
export async function createLibrary(input: z.input<typeof newLibraryInput>) {
  return run(async () => {
    const user = await authorize("settings:manage");
    const d = newLibraryInput.parse(input);
    const db = await getDb();
    const slug = d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || d.code.toLowerCase();
    const clash = await db.query.libraries.findFirst({ where: (l, { or }) => or(eq(l.code, d.code), eq(l.slug, slug)) });
    if (clash) throw new LibraryError(clash.code === d.code ? "errors.prefixTaken" : "errors.libraryExists", { code: d.code });
    const [lib] = await db.insert(libraries).values({ name: d.name, code: d.code, slug, tagline: d.tagline }).returning();
    await db.insert(memberships).values({ libraryId: lib.id, userId: user.id, role: "admin" });
    await db.insert(activity).values({ libraryId: lib.id, actorId: user.id, action: "library.create", ...activityText("activity.libraryCreate", { member: user.name, library: lib.name }) });
    await rememberLibrary(lib.id);
    revalidatePath("/", "layout");
    const { t } = await getI18n();
    return { message: t("actions.libraryCreated", { library: lib.name }) };
  });
}

/** Demo only: restore the sample data (the nightly job does the same). */
export async function resetDemoData() {
  return run(async () => {
    await authorize("settings:manage");
    if (!DEMO_MODE) throw new ActionError("errors.resetOff");
    const db = await getDb();
    await seed(db, { reset: true });
    (await cookies()).delete(LIBRARY_COOKIE);
    revalidatePath("/", "layout");
    const { t } = await getI18n();
    return { message: t("actions.demoRestored") };
  });
}

export async function markNotificationsRead(ids?: string[]) {
  return run(async () => {
    const user = await authorize();
    const db = await getDb();
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt), ids?.length ? inArray(notifications.id, ids) : undefined));
    revalidatePath("/", "layout");
    return {};
  });
}
