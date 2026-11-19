import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { can, type Permission } from "@/lib/permissions";
import type { Role } from "@/lib/db/schema";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? session.user.email ?? "Reader",
    email: session.user.email ?? "",
    image: session.user.image ?? null,
    role: session.user.role,
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

/** For server actions: throw instead of redirecting. */
export async function authorize(permission?: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new ActionError("Please sign in first.");
  if (permission && !can(user.role, permission)) {
    throw new ActionError("You don't have permission to do that.");
  }
  return user;
}
