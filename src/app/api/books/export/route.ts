import { NextResponse } from "next/server";
import { toCsv } from "@/lib/csv";
import { searchBooks } from "@/lib/library";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "books:manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const books = await searchBooks({ libraryId: user.library.id, sort: "title", limit: 100000 });
  const csv = toCsv([
    ["title", "author", "isbn", "genre", "year", "publisher", "pages", "language", "copies", "available", "shelf", "tags", "cover_url", "avg_rating", "times_borrowed"],
    ...books.map((b) => [
      b.title,
      b.author,
      b.isbn,
      b.genre,
      b.publishedYear,
      b.publisher,
      b.pages,
      b.language,
      b.totalCopies,
      b.available,
      b.location,
      b.tags.join(";"),
      b.coverUrl,
      b.avgRating,
      b.loanCount,
    ]),
  ]);
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="folio-${user.library.slug}-catalogue-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
