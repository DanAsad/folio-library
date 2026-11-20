"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/client";
import { BookCover } from "@/components/book-cover";
import { AvailabilityBadge, Stars } from "@/components/books/bits";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BookListItem } from "@/lib/library";

export function BookGrid({ books }: { books: BookListItem[] }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
      {books.map((b) => (
        <li key={b.id}>
          <Link href={`/books/${b.id}`} className="group block space-y-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <BookCover
              title={b.title}
              author={b.author}
              coverUrl={b.coverUrl}
              className="transition-transform duration-200 group-hover:-translate-y-1 group-hover:rotate-[-0.6deg]"
            />
            <div className="space-y-1">
              <p className="line-clamp-2 leading-snug font-medium group-hover:text-primary">{b.title}</p>
              <p className="truncate text-sm text-muted-foreground">{b.author}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <AvailabilityBadge book={b} />
                {b.avgRating !== null && <Stars value={b.avgRating} />}
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function BookTable({ books }: { books: BookListItem[] }) {
  const { t } = useI18n();
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="w-[40%]">{t("bookFields.title")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("bookFields.genre")}</TableHead>
            <TableHead className="hidden sm:table-cell">{t("bookFields.year")}</TableHead>
            <TableHead className="hidden lg:table-cell">ISBN</TableHead>
            <TableHead className="hidden lg:table-cell">{t("bookFields.shelf")}</TableHead>
            <TableHead>{t("bookFields.status")}</TableHead>
            <TableHead className="hidden xl:table-cell">{t("bookFields.rating")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {books.map((b) => (
            <TableRow key={b.id} className="group">
              <TableCell>
                <Link href={`/books/${b.id}`} className="flex items-center gap-3">
                  <BookCover title={b.title} author={b.author} coverUrl={b.coverUrl} className="w-9 shrink-0" size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium group-hover:text-primary">{b.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{b.author}</span>
                  </span>
                </Link>
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">{b.genre ?? "—"}</TableCell>
              <TableCell className="hidden text-muted-foreground tabular-nums sm:table-cell">{b.publishedYear ?? "—"}</TableCell>
              <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">{b.isbn ?? "—"}</TableCell>
              <TableCell className="hidden font-mono text-xs lg:table-cell">{b.location ?? "—"}</TableCell>
              <TableCell>
                <AvailabilityBadge book={b} long />
              </TableCell>
              <TableCell className="hidden xl:table-cell">
                <Stars value={b.avgRating} count={b.reviewCount} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
