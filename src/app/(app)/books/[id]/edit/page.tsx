import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/books/bits";
import { BookForm } from "@/components/books/book-form";
import { aiEnabled } from "@/lib/ai";
import { getDb } from "@/lib/db/client";
import { books } from "@/lib/db/schema";
import { getGenres } from "@/lib/library";
import { requirePermissionPage } from "@/lib/session";

export const metadata = { title: "Edit book" };

export default async function EditBookPage({ params }: PageProps<"/books/[id]/edit">) {
  await requirePermissionPage("books:manage");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const book = await db.query.books.findFirst({ where: eq(books.id, id) });
  if (!book) notFound();

  const s = (v: string | number | null) => (v === null ? "" : String(v));
  return (
    <>
      <PageHeader title="Edit book" description={book.title} />
      <BookForm
        bookId={book.id}
        genres={await getGenres()}
        aiAvailable={aiEnabled()}
        initial={{
          title: book.title,
          author: book.author,
          isbn: s(book.isbn),
          genre: s(book.genre),
          tags: book.tags.join(", "),
          publishedYear: s(book.publishedYear),
          publisher: s(book.publisher),
          pages: s(book.pages),
          language: book.language,
          description: s(book.description),
          coverUrl: s(book.coverUrl),
          totalCopies: String(book.totalCopies),
          location: s(book.location),
        }}
      />
    </>
  );
}
