import type { Role } from "@/lib/db/schema";

export type NavItem = {
  href: string;
  label: string;
  icon: "dashboard" | "catalog" | "loans" | "assistant" | "members" | "activity";
  roles?: Role[];
};

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/books", label: "Catalogue", icon: "catalog" },
  { href: "/loans", label: "Loans & holds", icon: "loans" },
  { href: "/assistant", label: "Ask the Librarian", icon: "assistant" },
  { href: "/members", label: "Members", icon: "members", roles: ["admin", "librarian"] },
  { href: "/activity", label: "Activity log", icon: "activity", roles: ["admin", "librarian"] },
];

export function navFor(role: Role) {
  return NAV.filter((n) => !n.roles || n.roles.includes(role));
}
