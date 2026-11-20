import Link from "next/link";
import { LogIn, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getCurrentUser } from "@/lib/session";
import { getI18n } from "@/i18n/server";

/** The public catalogue: anyone can browse what a library holds, without signing in. */
export default async function PublicCatalogLayout({ children }: LayoutProps<"/catalog">) {
  const [user, { t }] = await Promise.all([getCurrentUser(), getI18n()]);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-2 px-4 sm:px-6">
          <Logo href="/catalog" />
          <span className="ml-2 hidden rounded-full border px-2 py-0.5 text-xs text-muted-foreground sm:inline">{t("publicCatalog.badge")}</span>
          <div className="ml-auto flex items-center gap-1">
            <LanguageSwitcher />
            {user ? (
              <Button asChild size="sm">
                <Link href="/dashboard">
                  <LayoutDashboard /> {t("publicCatalog.openApp")}
                </Link>
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link href="/login">
                  <LogIn /> {t("publicCatalog.signIn")}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">{t("publicCatalog.footer")}</footer>
    </div>
  );
}
