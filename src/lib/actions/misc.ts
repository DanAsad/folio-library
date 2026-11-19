"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { activity, reviews, roleEnum, users } from "@/lib/db/schema";
import { LibraryError } from "@/lib/library";
import { ROLE_LABEL } from "@/lib/permissions";
import { authorize } from "@/lib/session";
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
    const review = await db.query.reviews.findFirst({ where: eq(reviews.id, reviewId) });
    if (!review) throw new LibraryError("Review not found.");
    if (review.userId !== user.id && user.role === "member") throw new LibraryError("You can only delete your own review.");
    await db.delete(reviews).where(eq(reviews.id, reviewId));
    revalidatePath(`/books/${review.bookId}`);
    return { message: "Review removed" };
  });
}

export async function setUserRole(userId: string, role: string) {
  return run(async () => {
    const admin = await authorize("users:manage");
    const parsed = z.enum(roleEnum.enumValues).parse(role);
    if (userId === admin.id) throw new LibraryError("You can't change your own role.");
    const db = await getDb();
    const [updated] = await db.update(users).set({ role: parsed }).where(eq(users.id, userId)).returning();
    if (!updated) throw new LibraryError("User not found.");
    await db.insert(activity).values({
      actorId: admin.id,
      action: "user.role",
      subjectUserId: userId,
      message: `${admin.name} made ${updated.name ?? updated.email} a ${ROLE_LABEL[parsed]}`,
    });
    revalidatePath("/members");
    return { message: `${updated.name ?? updated.email} is now a ${ROLE_LABEL[parsed]}.` };
  });
}
