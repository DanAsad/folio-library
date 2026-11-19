// Tenant (library) helpers shared by sign-in and the session.
import { and, asc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { activity, libraries, memberships, type Role } from "@/lib/db/schema";

export const LIBRARY_COOKIE = "folio-library";

export const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export async function defaultLibrary(db: DB) {
  const [lib] = await db.select().from(libraries).orderBy(asc(libraries.createdAt)).limit(1);
  return lib ?? null;
}

/**
 * Makes sure an SSO user belongs to the default library: new people join as members,
 * and anyone listed in ADMIN_EMAILS is an admin there.
 */
export async function ensureDefaultMembership(db: DB, user: { id: string; email: string; name: string | null }) {
  const lib = await defaultLibrary(db);
  if (!lib) return;
  const wantAdmin = adminEmails().includes(user.email.toLowerCase());
  const [existing] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.libraryId, lib.id), eq(memberships.userId, user.id)));
  if (!existing) {
    const role: Role = wantAdmin ? "admin" : "member";
    await db.insert(memberships).values({ libraryId: lib.id, userId: user.id, role }).onConflictDoNothing();
    await db.insert(activity).values({
      libraryId: lib.id,
      actorId: user.id,
      action: "user.join",
      subjectUserId: user.id,
      message: `${user.name ?? user.email} joined ${lib.name}${role === "admin" ? " as an admin" : ""}`,
    });
  } else if (wantAdmin && existing.role !== "admin") {
    await db.update(memberships).set({ role: "admin" }).where(eq(memberships.id, existing.id));
  }
}
