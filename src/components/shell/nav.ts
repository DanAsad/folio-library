import type { Role } from "@/lib/db/schema";
import type { MessageKey } from "@/i18n/translate";

export type NavItem = {
  href: string;
  /** Message key for the link text. */
  label: MessageKey;
  icon: "dashboard" | "catalog" | "loans" | "assistant" | "members" | "activity" | "reports" | "settings";
  roles?: Role[];
};

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "nav.dashboard", icon: "dashboard" },
  { href: "/books", label: "nav.catalogue", icon: "catalog" },
  { href: "/loans", label: "nav.loans", icon: "loans" },
  { href: "/assistant", label: "nav.assistant", icon: "assistant" },
  { href: "/members", label: "nav.members", icon: "members", roles: ["admin", "librarian"] },
  { href: "/reports", label: "nav.reports", icon: "reports", roles: ["admin", "librarian"] },
  { href: "/activity", label: "nav.activity", icon: "activity", roles: ["admin", "librarian"] },
  { href: "/settings", label: "nav.settings", icon: "settings", roles: ["admin"] },
];

export function navFor(role: Role) {
  return NAV.filter((n) => !n.roles || n.roles.includes(role));
}
