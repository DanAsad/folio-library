import { PageHeader } from "@/components/books/bits";
import { BookForm, EMPTY_BOOK } from "@/components/books/book-form";
import { aiEnabled } from "@/lib/ai";
import { getGenres } from "@/lib/library";
import { requirePermissionPage } from "@/lib/session";
import { getI18n } from "@/i18n/server";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("bookForm.newTitle") };
}

export default async function NewBookPage() {
  const user = await requirePermissionPage("books:manage");
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t("bookForm.newTitle")} description={t("bookForm.newDescription", { library: user.library.name })} />
      <BookForm initial={EMPTY_BOOK} genres={await getGenres(user.library.id)} aiAvailable={aiEnabled()} />
    </>
  );
}
