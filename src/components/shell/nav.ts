import type { Role } from "@/lib/db/schema";

export type NavItem = {
  href: string;
  label: string;
  icon: "dashboard" | "catalog" | "loans" | "assistant" | "members" | "activity" | "reports" | "settings";
  roles?: Role[];
};

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/books", label: "Catalogue", icon: "catalog" },
  { href: "/loans", label: "Loans & holds", icon: "loans" },
  { href: "/assistant", label: "Ask the Librarian", icon: "assistant" },
  { href: "/members", label: "Members & fines", icon: "members", roles: ["admin", "librarian"] },
  { href: "/reports", label: "Reports", icon: "reports", roles: ["admin", "librarian"] },
  { href: "/activity", label: "Activity log", icon: "activity", roles: ["admin", "librarian"] },
  { href: "/settings", label: "Library settings", icon: "settings", roles: ["admin"] },
];

export function navFor(role: Role) {
  return NAV.filter((n) => !n.roles || n.roles.includes(role));
}
