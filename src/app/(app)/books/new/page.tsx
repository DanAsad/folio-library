import { PageHeader } from "@/components/books/bits";
import { BookForm, EMPTY_BOOK } from "@/components/books/book-form";
import { aiEnabled } from "@/lib/ai";
import { getGenres } from "@/lib/library";
import { requirePermissionPage } from "@/lib/session";

export const metadata = { title: "Add a book" };

export default async function NewBookPage() {
  await requirePermissionPage("books:manage");
  return (
    <>
      <PageHeader title="Add a book" description="Add a new title to the catalogue." />
      <BookForm initial={EMPTY_BOOK} genres={await getGenres()} aiAvailable={aiEnabled()} />
    </>
  );
}
