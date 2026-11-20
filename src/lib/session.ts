import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/lib/db/client";
import { libraries, memberships, users, type Library, type Role } from "@/lib/db/schema";
import { can, type Permission } from "@/lib/permissions";
import { LIBRARY_COOKIE } from "@/lib/tenancy";

export type LibraryChoice = { id: string; name: string; tagline: string | null; role: Role };

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  /** Role in the current library. */
  role: Role;
  /** The library the user is working in (chosen with the switcher, stored in a cookie). */
  library: Library;
  libraries: LibraryChoice[];
};

async function loadMemberships(userId: string) {
  const db = await getDb();
  return db
    .select({ role: memberships.role, library: libraries })
    .from(memberships)
    .innerJoin(libraries, eq(libraries.id, memberships.libraryId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(libraries.createdAt));
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return null;
  const db = await getDb();
  const account = await db.query.users.findFirst({ where: eq(users.id, uid) });
  // Only the pre-made demo accounts can use the app.
  if (!account?.isDemo) return null;

  const rows = await loadMemberships(uid);
  if (!rows.length) return null;
  const wanted = (await cookies()).get(LIBRARY_COOKIE)?.value;
  const current = rows.find((r) => r.library.id === wanted) ?? rows[0];

  return {
    id: account.id,
    name: account.name ?? account.email ?? "Reader",
    email: account.email,
    image: account.image ?? null,
    role: current.role,
    library: current.library,
    libraries: rows.map((r) => ({ id: r.library.id, name: r.library.name, tagline: r.library.tagline, role: r.role })),
  };
});

/** For pages: redirect to the login page when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For pages: send users without the permission back to the dashboard. */
export async function requirePermissionPage(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/dashboard?denied=1");
  return user;
}

export class ActionError extends Error {}

/** For server actions: throw instead of redirecting. Permissions are checked against the current library. */
export async function authorize(permission?: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new ActionError("Please sign in first.");
  if (permission && !can(user.role, permission)) {
    throw new ActionError("You don't have permission to do that.");
  }
  return user;
}
