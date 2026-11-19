import { redirect } from "next/navigation";
import { BookOpenCheck, Sparkles, ScanBarcode, ShieldCheck } from "lucide-react";
import { DEMO_MODE, ssoProviders } from "@/auth";
import { getCurrentUser } from "@/lib/session";
import { searchBooks } from "@/lib/library";
import { Logo } from "@/components/logo";
import { BookCover } from "@/components/book-cover";
import { LoginCard } from "./login-card";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const featured = (await searchBooks({ sort: "popular", limit: 12 })).filter((b) => b.coverUrl).slice(0, 5);

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-[oklch(0.3_0.06_162)] text-[oklch(0.95_0.02_85)] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="paper-grain absolute inset-0 opacity-40" />
        <Logo href="/login" className="relative [&_span:first-child]:bg-[oklch(0.95_0.02_85)] [&_span:first-child]:text-[oklch(0.3_0.06_162)]" />
        <div className="relative max-w-lg space-y-6">
          <h1 className="text-5xl leading-[1.05] font-semibold">Your library, beautifully organised.</h1>
          <p className="text-lg text-[oklch(0.85_0.03_120)]">
            Catalogue books, lend them out, keep a waitlist moving, and let an AI librarian help readers find their next favourite.
          </p>
          <ul className="grid gap-3 text-sm text-[oklch(0.9_0.02_100)]">
            <li className="flex items-center gap-3"><BookOpenCheck className="size-4" /> Borrow, return, renew and waitlists, with due dates</li>
            <li className="flex items-center gap-3"><Sparkles className="size-4" /> Natural-language search and personal recommendations</li>
            <li className="flex items-center gap-3"><ScanBarcode className="size-4" /> Add books by scanning a barcode or typing an ISBN</li>
            <li className="flex items-center gap-3"><ShieldCheck className="size-4" /> SSO sign-in with admin, librarian and member roles</li>
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
      <section className="flex flex-col items-center justify-center gap-8 px-4 py-12 sm:px-8">
        <Logo href="/login" className="lg:hidden" />
        <LoginCard demoMode={DEMO_MODE} google={ssoProviders.google} github={ssoProviders.github} />
        <p className="max-w-sm text-center text-xs text-muted-foreground">
          Demo accounts share one sample library, so feel free to borrow, return and edit. You can reset everything with <code className="font-mono">npm run db:reset</code>.
        </p>
      </section>
    </div>
  );
}
