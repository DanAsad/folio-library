import { redirect } from "next/navigation";
import Link from "next/link";
import { BookOpenCheck, Building2, LibrarySquare, Sparkles, ScanBarcode, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getDb } from "@/lib/db/client";
import { searchBooks } from "@/lib/library";
import { defaultLibrary } from "@/lib/tenancy";
import { Logo } from "@/components/logo";
import { BookCover } from "@/components/book-cover";
import { LoginCard } from "./login-card";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getI18n } from "@/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("login.metaTitle") };
}

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const { t } = await getI18n();
  const lib = await defaultLibrary(await getDb());
  const featured = lib ? (await searchBooks({ libraryId: lib.id, sort: "popular", limit: 12 })).filter((b) => b.coverUrl).slice(0, 5) : [];

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-[oklch(0.3_0.06_162)] text-[oklch(0.95_0.02_85)] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="paper-grain absolute inset-0 opacity-40" />
        <Logo href="/login" className="relative [&_span:first-child]:bg-[oklch(0.95_0.02_85)] [&_span:first-child]:text-[oklch(0.3_0.06_162)]" />
        <div className="relative max-w-lg space-y-6">
          <h1 className="text-5xl leading-[1.05] font-semibold">{t("login.headline")}</h1>
          <p className="text-lg text-[oklch(0.85_0.03_120)]">
            {t("login.intro")}
          </p>
          <ul className="grid gap-3 text-sm text-[oklch(0.9_0.02_100)]">
            <li className="flex items-center gap-3"><BookOpenCheck className="size-4" /> {t("login.feature1")}</li>
            <li className="flex items-center gap-3"><Sparkles className="size-4" /> {t("login.feature2")}</li>
            <li className="flex items-center gap-3"><ScanBarcode className="size-4" /> {t("login.feature3")}</li>
            <li className="flex items-center gap-3"><ShieldCheck className="size-4" /> {t("login.feature4")}</li>
            <li className="flex items-center gap-3"><Building2 className="size-4" /> {t("login.feature5")}</li>
          </ul>
        </div>
        <div className="relative flex items-end gap-4">
          {featured.map((b, i) => (
            <div key={b.id} style={{ transform: `rotate(${(i - 2) * 3}deg) translateY(${Math.abs(i - 2) * 8}px)` }}>
              <BookCover title={b.title} author={b.author} coverUrl={b.coverUrl} className="w-28 shrink-0" size="sm" />
            </div>
          ))}
        </div>
      </section>

      {/* Sign-in panel */}
      <section className="relative flex flex-col items-center justify-center gap-8 px-4 py-12 sm:px-8">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher withLabel />
        </div>
        <Logo href="/login" className="lg:hidden" />
        <LoginCard />
        <Link href="/catalog" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
          <LibrarySquare className="size-4" /> {t("login.browsePublic")}
        </Link>
        <p className="max-w-sm text-center text-xs text-muted-foreground">{t("login.demoNote")}</p>
      </section>
    </div>
  );
}
