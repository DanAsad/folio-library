import Link from "next/link";
import { Download, Plus, SearchX, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookGrid, BookTable } from "@/components/books/book-views";
import { EmptyState, PageHeader } from "@/components/books/bits";
import { aiEnabled } from "@/lib/ai";
import { getGenres, searchBooks, SEARCH_FIELDS, SORTS, type BookSearch, type SearchField, type Sort } from "@/lib/library";
import { can } from "@/lib/permissions";
import { requireUser } from "@/lib/session";
import { CatalogToolbar } from "./catalog-toolbar";
import { ImportCsvButton } from "./import-csv";
import { getI18n } from "@/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("nav.catalogue") };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function CataloguePage({ searchParams }: PageProps<"/books">) {
  const user = await requireUser();
  const { t, rich } = await getI18n();
  const sp = await searchParams;
  const q = one(sp.q)?.trim() ?? "";
  const field = (SEARCH_FIELDS as readonly string[]).includes(one(sp.field) ?? "") ? (one(sp.field) as SearchField) : "all";
  const sortParam = one(sp.sort);
  const sort = (SORTS as readonly string[]).includes(sortParam ?? "") ? (sortParam as Sort) : undefined;
  const view = one(sp.view) === "table" ? "table" : "grid";
  // Smart search runs in the browser (free AI); it puts its interpretation in the URL:
  // ai=1 & q=<original request> & why=<explanation> & kw=<keywords> & from/to=<years>.
  const interpretation = one(sp.ai) === "1" && q ? one(sp.why)?.slice(0, 200) || null : null;
  const year = (v: string | undefined) => (v && /^\d{1,4}$/.test(v) ? Number(v) : undefined);

  const genres = await getGenres(user.library.id);
  const filters: BookSearch = {
    libraryId: user.library.id,
    q: interpretation ? one(sp.kw)?.trim() || undefined : q,
    field: interpretation ? "all" : field,
    genre: one(sp.genre) || undefined,
    availableOnly: one(sp.available) === "1",
    yearFrom: interpretation ? year(one(sp.from)) : undefined,
    yearTo: interpretation ? year(one(sp.to)) : undefined,
    sort,
  };

  let books = await searchBooks(filters);
  const wantsAi = Boolean(interpretation);
  // If smart filters were too strict, relax keywords before giving up.
  if (wantsAi && interpretation && books.length === 0 && filters.q) {
    books = await searchBooks({ ...filters, q: undefined });
  }

  const staff = can(user.role, "books:manage");
  const chips = interpretation
    ? [
        filters.genre && t("catalogue.chipGenre", { genre: filters.genre }),
        (filters.yearFrom || filters.yearTo) && t("catalogue.chipYears", { from: filters.yearFrom ?? "…", to: filters.yearTo ?? t("catalogue.now") }),
        filters.availableOnly && t("catalogue.availableNow"),
        filters.q && t("catalogue.chipKeywords", { keywords: filters.q }),
      ].filter(Boolean)
    : [];

  return (
    <>
      <PageHeader
        title={t("nav.catalogue")}
        description={q ? t("catalogue.countMatching", { count: books.length, query: q }) : t("catalogue.count", { count: books.length })}
        actions={
          staff && (
            <>
              <ImportCsvButton />
              <Button variant="outline" size="sm" asChild>
                <a href="/api/books/export" download>
                  <Download /> {t("catalogue.exportCsv")}
                </a>
              </Button>
              <Button size="sm" asChild>
                <Link href="/books/new">
                  <Plus /> {t("shell.addBook")}
                </Link>
              </Button>
            </>
          )
        }
      />

      <CatalogToolbar genres={genres} aiAvailable={aiEnabled()} />

      {interpretation && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-accent/50 px-4 py-3 text-sm">
          <Sparkles className="size-4 text-primary" />
          <span className="text-accent-foreground">{interpretation}</span>
          {chips.map((c) => (
            <span key={String(c)} className="rounded-full bg-background/80 px-2 py-0.5 text-xs font-medium">
              {c}
            </span>
          ))}
        </div>
      )}
      <div className="mt-6">
        {books.length === 0 ? (
          <EmptyState icon={<SearchX className="size-5" />} title={t("catalogue.noneTitle")}>
            {rich("catalogue.noneBody", { smart: <strong>{t("catalogue.smartSearch")}</strong> })}
          </EmptyState>
        ) : view === "table" ? (
          <BookTable books={books} />
        ) : (
          <BookGrid books={books} />
        )}
      </div>
    </>
  );
}
