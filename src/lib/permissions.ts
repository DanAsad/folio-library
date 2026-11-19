import type { Role } from "@/lib/db/schema";

/**
 * Role-based access control. Roles are per library (see `memberships`), and every server
 * action and protected page checks one of these permissions against the role in the
 * current library, so the UI hiding a button is never the only line of defence.
 */
export const PERMISSIONS = {
  "books:manage": ["admin", "librarian"], // add / edit / delete / import books, manage copies
  "loans:manage": ["admin", "librarian"], // issue & receive books for any member, see all loans
  "fines:manage": ["admin", "librarian"], // record payments, waive or add fines
  "activity:view": ["admin", "librarian"],
  "reports:view": ["admin", "librarian"],
  "users:manage": ["admin"], // add people, change roles
  "settings:manage": ["admin"], // library rules, new libraries, demo reset
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
  admin: "Full access, including people, roles and the library's rules.",
  librarian: "Runs the desk: catalogue, copies, check-in/out and fines.",
  member: "Browses the catalogue, borrows, returns, joins waitlists and reviews.",
};
