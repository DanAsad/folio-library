"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { activity, books, memberships, reviews, roleEnum, users } from "@/lib/db/schema";
import { LibraryError } from "@/lib/library";
import { authorize } from "@/lib/session";
import { personInput } from "@/lib/validation";
import { getI18n } from "@/i18n/server";
import { activityText, keyParam } from "@/i18n/stored";
import { run } from "./result";

const reviewInput = z.object({
  bookId: z.string().uuid(),
  rating: z.number().int().min(1, "validation.rating").max(5),
  body: z.string().trim().max(2000).optional(),
});

export async function saveReview(input: z.input<typeof reviewInput>) {
  return run(async () => {
    const user = await authorize();
    const data = reviewInput.parse(input);
    const db = await getDb();
    const book = await db.query.books.findFirst({ where: and(eq(books.id, data.bookId), eq(books.libraryId, user.library.id)) });
    if (!book) throw new LibraryError("errors.bookNotFound");
    await db
      .insert(reviews)
      .values({ ...data, userId: user.id, body: data.body || null })
      .onConflictDoUpdate({
        target: [reviews.bookId, reviews.userId],
        set: { rating: data.rating, body: data.body || null, createdAt: new Date() },
      });
    revalidatePath(`/books/${data.bookId}`);
    const { t } = await getI18n();
    return { message: t("actions.reviewSaved") };
  });
}

export async function deleteReview(reviewId: string) {
  return run(async () => {
    const user = await authorize();
    const db = await getDb();
    const review = await db.query.reviews.findFirst({ where: eq(reviews.id, reviewId), with: { book: true } });
    if (!review || review.book.libraryId !== user.library.id) throw new LibraryError("errors.reviewNotFound");
    if (review.userId !== user.id && user.role === "member") throw new LibraryError("errors.reviewOwn");
    await db.delete(reviews).where(eq(reviews.id, reviewId));
    revalidatePath(`/books/${review.bookId}`);
    const { t } = await getI18n();
    return { message: t("actions.reviewRemoved") };
  });
}

/** Changes someone's role in the current library only. */
export async function setUserRole(userId: string, role: string) {
  return run(async () => {
    const admin = await authorize("users:manage");
    const parsed = z.enum(roleEnum.enumValues).parse(role);
    if (userId === admin.id) throw new LibraryError("errors.ownRole");
    const db = await getDb();
    const [updated] = await db
      .update(memberships)
      .set({ role: parsed })
      .where(and(eq(memberships.libraryId, admin.library.id), eq(memberships.userId, userId)))
      .returning();
    if (!updated) throw new LibraryError("errors.notMember");
    const person = await db.query.users.findFirst({ where: eq(users.id, userId) });
    const who = person?.name ?? person?.email ?? "Member";
    await db.insert(activity).values({
      libraryId: admin.library.id,
      actorId: admin.id,
      action: "user.role",
      subjectUserId: userId,
      ...activityText("activity.userRole", { member: admin.name, person: who, role: keyParam(`roles.${parsed}`) }),
    });
    revalidatePath("/members");
    const { t } = await getI18n();
    return { message: t("actions.roleChanged", { person: who, role: t(`roles.${parsed}`), library: admin.library.name }) };
  });
}

/**
 * Adds a person to the current library. If they don't have an account yet, a member record is
 * created for their email, so staff can lend to them at the desk. Only demo accounts can sign in.
 */
export async function addPerson(input: z.input<typeof personInput>) {
  return run(async () => {
    const admin = await authorize("users:manage");
    const data = personInput.parse(input);
    const db = await getDb();
    let person = await db.query.users.findFirst({ where: eq(users.email, data.email) });
    if (!person) [person] = await db.insert(users).values({ email: data.email, name: data.name }).returning();
    const [existing] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.libraryId, admin.library.id), eq(memberships.userId, person.id)));
    if (existing) throw new LibraryError(`errors.alreadyRole.${existing.role}`, { person: person.name ?? person.email });
    await db.insert(memberships).values({ libraryId: admin.library.id, userId: person.id, role: data.role });
    await db.insert(activity).values({
      libraryId: admin.library.id,
      actorId: admin.id,
      action: "user.join",
      subjectUserId: person.id,
      ...activityText("activity.userJoin", { member: admin.name, person: person.name ?? person.email, role: keyParam(`roles.${data.role}`) }),
    });
    revalidatePath("/members");
    const { t } = await getI18n();
    return { message: t("actions.personAdded", { person: person.name ?? person.email, role: t(`roles.${data.role}`) }) };
  });
}
