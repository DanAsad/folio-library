import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookText, Building2, CalendarClock, Hash, Languages, LogIn, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BookCover } from "@/components/book-cover";
import { AvailabilityBadge, Stars } from "@/components/books/bits";
import { BookGrid } from "@/components/books/book-views";
import { getPublicBook } from "@/lib/public-catalog";
import { cn } from "@/lib/utils";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n";

export async function generateMetadata({ params }: PageProps<"/catalog/[id]">) {
  const data = await getPublicBook((await params).id);
  if (!data) return { title: (await getI18n()).t("bookPage.book") };
  return { title: `${data.book.title} · ${data.library.name}`, description: data.book.description?.slice(0, 160) };
}

export default async function PublicBookPage({ params }: PageProps<"/catalog/[id]">) {
  const data = await getPublicBook((await params).id);
  if (!data) notFound();
  const { book, library, nextDue, reviews, similar } = data;
  const { t, date, relative } = await getI18n();
  const back = `/catalog?library=${library.slug}`;

  const meta: { icon: typeof Hash; label: MessageKey; value: string | number | null }[] = [
    { icon: Hash, label: "bookFields.isbn", value: book.isbn },
    { icon: CalendarClock, label: "bookFields.published", value: book.publishedYear },
    { icon: Building2, label: "bookFields.publisher", value: book.publisher },
    { icon: BookText, label: "bookFields.pages", value: book.pages },
    { icon: Languages, label: "bookFields.language", value: book.language },
    { icon: MapPin, label: "bookFields.shelf", value: book.location },
  ];

  return (
    <div className="space-y-10">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href={back}>
          <ArrowLeft /> {library.name}
        </Link>
      </Button>

      <div className="grid gap-8 md:grid-cols-[minmax(0,260px)_1fr] lg:gap-12">
        <div className="space-y-5">
          <BookCover title={book.title} author={book.author} coverUrl={book.coverUrl} size="lg" className="mx-auto w-48 md:w-full" />
          <Card className="gap-4 py-4">
            <CardContent className="space-y-3 px-4">
              <div className="flex items-center justify-between">
                <AvailabilityBadge book={book} long />
                <span className="text-xs text-muted-foreground">{t("dashboard.copiesCount", { count: book.totalCopies })}</span>
              </div>
              {book.available === 0 && nextDue && <p className="text-xs text-muted-foreground">{t("bookPage.nextDue", { when: relative(nextDue), date: nextDue })}</p>}
              {book.waitingHolds > 0 && <p className="text-xs text-muted-foreground">{t("publicCatalog.waiting", { count: book.waitingHolds })}</p>}
              <Button asChild className="w-full">
                <Link href="/login">
                  <LogIn /> {book.available > 0 ? t("publicCatalog.signInToBorrow") : t("publicCatalog.signInToWait")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-8">
          <div className="space-y-3">
            {book.genre && (
              <Link href={`${back}&genre=${encodeURIComponent(book.genre)}`} className="text-sm font-medium text-primary hover:underline">
                {book.genre}
              </Link>
            )}
            <h1 className="text-4xl leading-tight font-semibold text-balance">{book.title}</h1>
            <p className="text-lg text-muted-foreground">
              {t("bookPage.by")}{" "}
              <Link href={`${back}&q=${encodeURIComponent(book.author)}`} className="text-foreground hover:text-primary hover:underline">
                {book.author}
              </Link>
            </p>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <Stars value={book.avgRating} count={book.reviewCount} size="md" />
              <span className="flex items-center gap-1.5">
                <Users className="size-4" /> {t("bookPage.borrowedTimes", { count: book.loanCount })}
              </span>
            </div>
          </div>

          {book.description && <p className="max-w-prose text-[1.05rem] leading-relaxed">{book.description}</p>}

          {book.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {book.tags.map((tag) => (
                <Badge key={tag} variant="secondary" asChild>
                  <Link href={`${back}&q=${encodeURIComponent(tag)}`}>#{tag}</Link>
                </Badge>
              ))}
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border bg-card p-5 sm:grid-cols-3">
            {meta
              .filter((m) => m.value)
              .map(({ icon: Icon, label, value }) => (
                <div key={label} className="space-y-1">
                  <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon className="size-3.5" /> {t(label)}
                  </dt>
                  <dd className={cn("text-sm font-medium", label === "bookFields.isbn" && "font-mono")}>{value}</dd>
                </div>
              ))}
          </dl>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">{t("publicCatalog.reviews")}</h2>
            {reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("publicCatalog.noReviews")}</p>
            ) : (
              <ul className="divide-y rounded-xl border bg-card">
                {reviews.map((r) => (
                  <li key={r.id} className="space-y-1.5 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <Stars value={r.rating} />
                      <span className="text-xs text-muted-foreground">{date(r.createdAt, "medium")}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{r.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {similar.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">{t("bookPage.moreLikeThis")}</h2>
          <BookGrid books={similar.slice(0, 5)} basePath="/catalog" />
        </section>
      )}
    </div>
  );
}
