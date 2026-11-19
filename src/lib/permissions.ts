import type { Role } from "@/lib/db/schema";

/**
 * Role-based access control. Every server action and protected page checks one of
 * these permissions, so the UI hiding a button is never the only line of defence.
 */
export const PERMISSIONS = {
  "books:manage": ["admin", "librarian"], // add / edit / delete / import books
  "loans:manage": ["admin", "librarian"], // issue & receive books for any member, see all loans
  "activity:view": ["admin", "librarian"],
  "reports:view": ["admin", "librarian"],
  "users:manage": ["admin"], // change roles
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  librarian: "Librarian",
  member: "Member",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: "Full access, including user and role management.",
  librarian: "Manages the catalogue and checks books in and out for members.",
  member: "Browses the catalogue, borrows, returns, joins waitlists and reviews.",
};
