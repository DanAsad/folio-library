"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  BarChart3,
  BookMarked,
  LayoutDashboard,
  LibrarySquare,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/logo";
import { CommandMenu, useCommandMenu } from "@/components/shell/command-menu";
import { LibrarySwitcher } from "@/components/shell/library-switcher";
import { navFor, type NavItem } from "@/components/shell/nav";
import { NotificationsBell, type NotificationItem } from "@/components/shell/notifications-bell";
import { signOutAction } from "@/lib/actions/auth";
import { can } from "@/lib/permissions";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/i18n/client";
import type { CurrentUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

const ICONS: Record<NavItem["icon"], typeof Activity> = {
  dashboard: LayoutDashboard,
  catalog: LibrarySquare,
  loans: BookMarked,
  assistant: Sparkles,
  members: Users,
  activity: Activity,
  reports: BarChart3,
  settings: Settings,
};

function NavLinks({ user, badges, onNavigate }: { user: CurrentUser; badges: Record<string, number>; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useI18n();
  return (
    <nav className="grid gap-1">
      {navFor(user.role).map((item) => {
        const Icon = ICONS[item.icon];
        const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
        const count = badges[item.href];
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_2px_0_0_var(--primary)]"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <Icon className={cn("size-4", active && "text-primary")} />
            <span className="flex-1">{t(item.label)}</span>
            {count ? (
              <span className="rounded-full bg-destructive/15 px-1.5 text-[0.7rem] font-semibold text-destructive tabular-nums">{count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useI18n();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("shell.toggleTheme")}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}

export function AppShell({
  user,
  badges,
  notifications,
  children,
}: {
  user: CurrentUser;
  badges: Record<string, number>;
  notifications: { unread: number; items: NotificationItem[] };
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const command = useCommandMenu();
  const { t, rich } = useI18n();

  const sidebarFooter = (
    <div className="rounded-lg border bg-card/60 p-3 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">{t("shell.tip")}</p>
      {rich("shell.tipSearch", { keys: <><kbd className="rounded border bg-muted px-1 font-mono">Ctrl</kbd> + <kbd className="rounded border bg-muted px-1 font-mono">K</kbd></> })}
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 border-r bg-sidebar px-4 py-5 lg:flex">
        <Logo className="px-2" />
        <LibrarySwitcher user={user} />
        <NavLinks user={user} badges={badges} />
        <div className="mt-auto">{sidebarFooter}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("shell.openMenu")}>
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-5">
              <SheetTitle className="sr-only">{t("shell.navigation")}</SheetTitle>
              <div className="flex h-full flex-col gap-6">
                <Logo />
                <LibrarySwitcher user={user} onNavigate={() => setMobileOpen(false)} />
                <NavLinks user={user} badges={badges} onNavigate={() => setMobileOpen(false)} />
                <div className="mt-auto">{sidebarFooter}</div>
              </div>
            </SheetContent>
          </Sheet>

          <button
            type="button"
            onClick={() => command.setOpen(true)}
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-primary/30 sm:max-w-md"
          >
            <Search className="size-4" />
            <span className="flex-1 truncate text-left">{t("shell.searchPlaceholder")}</span>
            <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[0.7rem] sm:inline">Ctrl K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            {can(user.role, "books:manage") && (
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/books/new">
                  <Plus /> {t("shell.addBook")}
                </Link>
              </Button>
            )}
            <NotificationsBell items={notifications.items} unread={notifications.unread} multiLibrary={user.libraries.length > 1} currentLibraryId={user.library.id} />
            <LanguageSwitcher />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="rounded-full ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("shell.accountMenu")}>
                  <Avatar className="size-8">
                    {user.image && <AvatarImage src={user.image} alt="" />}
                    <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">{initials(user.name)}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="space-y-1">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs font-normal text-muted-foreground">{user.email}</p>
                  <Badge variant="secondary">
                    {t(`roles.${user.role}`)} · {user.library.name}
                  </Badge>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/loans">
                    <BookMarked /> {t("shell.myLoans")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => signOutAction()}>
                  <LogOut /> {t("shell.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>

      <CommandMenu {...command} user={user} />
    </div>
  );
}
