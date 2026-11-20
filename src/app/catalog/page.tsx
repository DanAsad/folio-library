import Link from "next/link";
import { notFound } from "next/navigation";
import { Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookGrid } from "@/components/books/book-views";
import { EmptyState } from "@/components/books/bits";
import { getGenres, searchBooks, SORTS, type Sort } from "@/lib/library";
import { resolvePublicLibrary } from "@/lib/public-catalog";
import { cn } from "@/lib/utils";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n";

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const SORT_LABELS: Record<Exclude<Sort, "relevance">, MessageKey> = {
  title: "catalogue.sorts.title",
  author: "catalogue.sorts.author",
  popular: "catalogue.sorts.popular",
  rating: "catalogue.sorts.rating",
  year: "catalogue.sorts.year",
  newest: "catalogue.sorts.newest",
};

export async function generateMetadata({ searchParams }: PageProps<"/catalog">) {
  const [{ library }, { t }] = await Promise.all([resolvePublicLibrary(one((await searchParams).library)), getI18n()]);
  return {
    title: library ? t("publicCatalog.metaTitle", { library: library.name }) : t("nav.catalogue"),
    description: t("publicCatalog.metaDescription"),
  };
}

const selectClass =
  "h-10 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

export default async function PublicCataloguePage({ searchParams }: PageProps<"/catalog">) {
  const sp = await searchParams;
  const { libraries, library } = await resolvePublicLibrary(one(sp.library));
  if (!library) notFound();
  const { t } = await getI18n();

  const q = one(sp.q)?.trim().slice(0, 100) ?? "";
  const genre = one(sp.genre) || undefined;
  const availableOnly = one(sp.available) === "1";
  const sortParam = one(sp.sort);
  const sort = (SORTS as readonly string[]).includes(sortParam ?? "") ? (sortParam as Sort) : undefined;

  const [genres, books] = await Promise.all([
    getGenres(library.id),
    searchBooks({ libraryId: library.id, q, genre, availableOnly, sort, limit: 120 }),
  ]);
  const filtered = Boolean(q || genre || availableOnly);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        {libraries.length > 1 && (
          <nav className="flex flex-wrap gap-2 text-sm" aria-label={t("publicCatalog.chooseLibrary")}>
            {libraries.map((l) => (
              <Link
                key={l.id}
                href={`/catalog?library=${l.slug}`}
                className={cn(
                  "rounded-full border px-3 py-1 font-medium transition-colors",
                  l.id === library.id ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {l.name}
              </Link>
            ))}
          </nav>
        )}
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold sm:text-4xl">{library.name}</h1>
          {library.tagline && <p className="text-muted-foreground">{library.tagline}</p>}
          <p className="text-sm text-muted-foreground">{t("publicCatalog.rules", { days: library.loanDays, count: library.maxRenewals })}</p>
        </div>
      </section>

      {/* A plain GET form: works without JavaScript and gives shareable search links. */}
      <form action="/catalog" className="flex flex-col gap-2 rounded-xl border bg-card/60 p-3 md:flex-row md:items-center" role="search">
        <input type="hidden" name="library" value={library.slug} />
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder={t("catalogue.placeholder")} aria-label={t("catalogue.searchLabel")} className="h-10 bg-card pl-9" />
        </div>
        <select name="genre" defaultValue={genre ?? ""} aria-label={t("bookFields.genre")} className={selectClass}>
          <option value="">{t("catalogue.allGenres")}</option>
          {genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={sort ?? ""} aria-label={t("catalogue.sortBy")} className={selectClass}>
          <option value="">{q ? t("catalogue.sorts.relevance") : t("catalogue.sorts.title")}</option>
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {t(label)}
            </option>
          ))}
        </select>
        <label className="flex h-10 items-center gap-2 px-1 text-sm">
          <input type="checkbox" name="available" value="1" defaultChecked={availableOnly} className="size-4 accent-[var(--primary)]" />
          {t("catalogue.availableNow")}
        </label>
        <Button type="submit" className="h-10">
          {t("command.search")}
        </Button>
      </form>

      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {q ? t("catalogue.countMatching", { count: books.length, query: q }) : t("catalogue.count", { count: books.length })}
        </p>
        {filtered && (
          <Link href={`/catalog?library=${library.slug}`} className="text-sm text-primary hover:underline">
            {t("publicCatalog.clearFilters")}
          </Link>
        )}
      </div>

      {books.length === 0 ? (
        <EmptyState icon={<SearchX className="size-5" />} title={t("catalogue.noneTitle")}>
          {t("publicCatalog.noneBody")}
        </EmptyState>
      ) : (
        <BookGrid books={books} basePath="/catalog" />
      )}

      <section className="flex flex-col items-start justify-between gap-4 rounded-2xl border bg-[oklch(0.3_0.06_162)] p-6 text-[oklch(0.95_0.02_85)] sm:flex-row sm:items-center">
        <div className="space-y-1">
          <p className="font-heading text-xl">{t("publicCatalog.ctaTitle")}</p>
          <p className="text-sm opacity-80">{t("publicCatalog.ctaBody")}</p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/login">{t("publicCatalog.signIn")}</Link>
        </Button>
      </section>
    </div>
  );
}
