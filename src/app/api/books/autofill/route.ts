import { NextResponse } from "next/server";
import { z } from "zod";
import { lookupOpenLibrary } from "@/lib/openlibrary";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

const Body = z.object({
  isbn: z.string().max(20).optional(),
  title: z.string().max(300).optional(),
  author: z.string().max(300).optional(),
});

/**
 * Bibliographic facts for a new catalogue entry from Open Library. The blurb, genre and
 * tags are then written by the free AI, called from the librarian's browser.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "books:manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { isbn, title, author } = body.data;
  if (!isbn && !title) return NextResponse.json({ error: "Enter an ISBN or a title first." }, { status: 400 });

  const ol = await lookupOpenLibrary({ isbn, title, author });
  if (!ol) return NextResponse.json({ found: false, title, author, isbn });

  return NextResponse.json({
    found: true,
    title: ol.title ?? title,
    author: ol.author ?? author,
    isbn: ol.isbn ?? isbn,
    publisher: ol.publisher,
    publishedYear: ol.publishedYear,
    pages: ol.pages,
    coverUrl: ol.coverUrl,
    subjects: ol.subjects ?? [],
  });
}
