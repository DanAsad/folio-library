"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { activity, books, memberships, reviews, roleEnum, users } from "@/lib/db/schema";
import { LibraryError } from "@/lib/library";
import { ROLE_LABEL } from "@/lib/permissions";
import { authorize } from "@/lib/session";
import { personInput } from "@/lib/validation";
import { run } from "./result";

const reviewInput = z.object({
  bookId: z.string().uuid(),
  rating: z.number().int().min(1, "Pick a rating from 1 to 5 stars.").max(5),
  body: z.string().trim().max(2000).optional(),
});

export async function saveReview(input: z.input<typeof reviewInput>) {
  return run(async () => {
    const user = await authorize();
    const data = reviewInput.parse(input);
    const db = await getDb();
    const book = await db.query.books.findFirst({ where: and(eq(books.id, data.bookId), eq(books.libraryId, user.library.id)) });
    if (!book) throw new LibraryError("Book not found.");
    await db
      .insert(reviews)
      .values({ ...data, userId: user.id, body: data.body || null })
      .onConflictDoUpdate({
        target: [reviews.bookId, reviews.userId],
        set: { rating: data.rating, body: data.body || null, createdAt: new Date() },
      });
    revalidatePath(`/books/${data.bookId}`);
    return { message: "Thanks for your review!" };
  });
}

export async function deleteReview(reviewId: string) {
  return run(async () => {
    const user = await authorize();
    const db = await getDb();
    const review = await db.query.reviews.findFirst({ where: eq(reviews.id, reviewId), with: { book: true } });
    if (!review || review.book.libraryId !== user.library.id) throw new LibraryError("Review not found.");
    if (review.userId !== user.id && user.role === "member") throw new LibraryError("You can only delete your own review.");
    await db.delete(reviews).where(eq(reviews.id, reviewId));
    revalidatePath(`/books/${review.bookId}`);
    return { message: "Review removed" };
  });
}

/** Changes someone's role in the current library only. */
export async function setUserRole(userId: string, role: string) {
  return run(async () => {
    const admin = await authorize("users:manage");
    const parsed = z.enum(roleEnum.enumValues).parse(role);
    if (userId === admin.id) throw new LibraryError("You can't change your own role.");
    const db = await getDb();
    const [updated] = await db
      .update(memberships)
      .set({ role: parsed })
      .where(and(eq(memberships.libraryId, admin.library.id), eq(memberships.userId, userId)))
      .returning();
    if (!updated) throw new LibraryError("That person isn't a member of this library.");
    const person = await db.query.users.findFirst({ where: eq(users.id, userId) });
    const who = person?.name ?? person?.email ?? "Member";
    await db.insert(activity).values({
      libraryId: admin.library.id,
      actorId: admin.id,
      action: "user.role",
      subjectUserId: userId,
      message: `${admin.name} made ${who} a ${ROLE_LABEL[parsed]}`,
    });
    revalidatePath("/members");
    return { message: `${who} is now a ${ROLE_LABEL[parsed]} at ${admin.library.name}.` };
  });
}

/**
 * Adds a person to the current library. If they don't have an account yet, one is created
 * for their email; they get access by signing in with SSO using that email.
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
    if (existing) throw new LibraryError(`${person.name ?? person.email} is already a ${ROLE_LABEL[existing.role]} here.`);
    await db.insert(memberships).values({ libraryId: admin.library.id, userId: person.id, role: data.role });
    await db.insert(activity).values({
      libraryId: admin.library.id,
      actorId: admin.id,
      action: "user.join",
      subjectUserId: person.id,
      message: `${admin.name} added ${person.name ?? person.email} as a ${ROLE_LABEL[data.role]}`,
    });
    revalidatePath("/members");
    return { message: `${person.name ?? person.email} added as a ${ROLE_LABEL[data.role]}.` };
  });
}
