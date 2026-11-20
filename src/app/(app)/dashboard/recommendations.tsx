import { and, desc, eq } from "drizzle-orm";
import { Sparkles } from "lucide-react";
import { aiEnabled } from "@/lib/ai";
import { getDb } from "@/lib/db/client";
import { loans, reviews } from "@/lib/db/schema";
import { searchBooks } from "@/lib/library";
import { PicksPanel, type PickBook } from "./picks-panel";
import { getI18n } from "@/i18n/server";

/**
 * "Picked for you": instant picks from the reader's favourite genres, which the reader can
 * upgrade to AI picks (with a personal reason for each) using the free AI in their browser.
 */
export async function Recommendations({ userId, libraryId }: { userId: string; libraryId: string }) {
  const db = await getDb();
  const { t, locale } = await getI18n();
  const [history, myReviews, catalogue] = await Promise.all([
    db.query.loans.findMany({ where: and(eq(loans.libraryId, libraryId), eq(loans.userId, userId)), with: { book: true }, orderBy: desc(loans.borrowedAt), limit: 30 }),
    db.query.reviews.findMany({ where: eq(reviews.userId, userId) }),
    searchBooks({ libraryId, sort: "popular", limit: 400 }),
  ]);

  const read = new Set([...history.map((l) => l.bookId), ...myReviews.map((r) => r.bookId)]);
  const ratings = new Map(myReviews.map((r) => [r.bookId, r.rating]));
  const candidates: PickBook[] = catalogue
    .filter((b) => !read.has(b.id))
    .map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      genre: b.genre,
      tags: b.tags,
      coverUrl: b.coverUrl,
      available: b.available,
      totalCopies: b.totalCopies,
      waitingHolds: b.waitingHolds,
      readyHolds: b.readyHolds,
      loanCount: b.loanCount,
    }));
  const uniqueHistory = Array.from(new Map(history.map((l) => [l.bookId, l])).values()).slice(0, 15);

  // Heuristic: favourite genres first, then available, then popular.
  const genreCounts = new Map<string, number>();
  for (const l of uniqueHistory) if (l.book.genre) genreCounts.set(l.book.genre, (genreCounts.get(l.book.genre) ?? 0) + 1);
  const fav = [...genreCounts.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
  const initial = [...candidates]
    .sort((a, b) => {
      const ga = fav.indexOf(a.genre ?? "");
      const gb = fav.indexOf(b.genre ?? "");
      return (ga === -1 ? 99 : ga) - (gb === -1 ? 99 : gb) || Number(b.available > 0) - Number(a.available > 0) || b.loanCount - a.loanCount;
    })
    .slice(0, 4)
    .map((book) => ({
      book,
      reason: book.genre && fav.includes(book.genre) ? t("picks.reasonGenre", { genre: book.genre }) : t("picks.reasonPopular"),
    }));

  return (
    <PicksPanel
      // Start over when the language changes: the panel keeps its picks in state.
      key={locale}
      initial={initial}
      candidates={candidates.slice(0, 60)}
      history={uniqueHistory.map((l) => ({ title: l.book.title, author: l.book.author, genre: l.book.genre, rating: ratings.get(l.bookId) ?? null }))}
      aiAvailable={aiEnabled()}
    />
  );
}

export async function RecommendationsSkeleton() {
  const { t } = await getI18n();
  return (
    <section className="space-y-4">
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <Sparkles className="size-5 animate-pulse text-primary" /> {t("picks.title")}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex h-32 gap-4 rounded-xl border bg-card p-4">
            <div className="aspect-[2/3] w-16 animate-pulse rounded-md bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-full animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
