"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { activity, books, copyConditionEnum, copyStatusEnum, loans } from "@/lib/db/schema";
import { addCopies, LibraryError, updateCopy } from "@/lib/library";
import { authorize } from "@/lib/session";
import { bookInput, type BookInput } from "@/lib/validation";
import { parseCsv } from "@/lib/csv";
import { getI18n } from "@/i18n/server";
import { activityText } from "@/i18n/stored";
import { translateIssue } from "@/i18n/issues";
import { run } from "./result";

async function ownBook(libraryId: string, id: string) {
  const db = await getDb();
  const book = await db.query.books.findFirst({ where: and(eq(books.id, id), eq(books.libraryId, libraryId)) });
  if (!book) throw new LibraryError("errors.bookNotFound");
  return book;
}

export async function createBook(input: BookInput) {
  return run(async () => {
    const user = await authorize("books:manage");
    const { copies: count, ...data } = bookInput.parse(input);
    const db = await getDb();
    const book = await db.transaction(async (tx) => {
      const [created] = await tx.insert(books).values({ ...data, libraryId: user.library.id, createdById: user.id }).returning();
      await tx.insert(activity).values({
        libraryId: user.library.id,
        actorId: user.id,
        action: "book.create",
        bookId: created.id,
        ...activityText("activity.bookCreate", { member: user.name, title: created.title }),
      });
      await addCopies({ libraryId: user.library.id, bookId: created.id, count, condition: "new", actorId: null }, tx);
      return created;
    });
    revalidatePath("/", "layout");
    const { t } = await getI18n();
    return { message: t("actions.bookAdded", { title: book.title, count }), data: { id: book.id } };
  });
}

export async function updateBook(id: string, input: BookInput) {
  return run(async () => {
    const user = await authorize("books:manage");
    await ownBook(user.library.id, id);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { copies: _ignored, ...data } = bookInput.parse(input);
    const db = await getDb();
    const [book] = await db
      .update(books)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(books.id, id))
      .returning();
    await db.insert(activity).values({
      libraryId: user.library.id,
      actorId: user.id,
      action: "book.update",
      bookId: id,
      ...activityText("activity.bookUpdate", { member: user.name, title: book.title }),
    });
    revalidatePath("/", "layout");
    const { t } = await getI18n();
    return { message: t("actions.changesSaved"), data: { id } };
  });
}

export async function deleteBook(id: string) {
  return run(async () => {
    const user = await authorize("books:manage");
    const book = await ownBook(user.library.id, id);
    const db = await getDb();
    const out = await db.query.loans.findFirst({ where: and(eq(loans.bookId, id), isNull(loans.returnedAt)) });
    if (out) throw new LibraryError("errors.deleteOnLoan");
    await db.delete(books).where(eq(books.id, id));
    await db.insert(activity).values({
      libraryId: user.library.id,
      actorId: user.id,
      action: "book.delete",
      ...activityText("activity.bookDelete", { member: user.name, title: book.title }),
    });
    revalidatePath("/", "layout");
    const { t } = await getI18n();
    return { message: t("actions.bookDeleted", { title: book.title }) };
  });
}

export async function addCopiesToBook(bookId: string, count: number, condition: string) {
  return run(async () => {
    const user = await authorize("books:manage");
    const res = await addCopies({
      libraryId: user.library.id,
      bookId,
      count: Number(count),
      condition: z.enum(copyConditionEnum.enumValues).parse(condition),
      actorId: user.id,
    });
    revalidatePath("/", "layout");
    const { t } = await getI18n();
    return {
      message:
        res.barcodes.length === 1
          ? t("actions.copyAdded", { barcode: res.barcodes[0] })
          : t("actions.copiesAdded", { first: res.barcodes[0], last: res.barcodes.at(-1) }),
    };
  });
}

const copyPatch = z.object({
  condition: z.enum(copyConditionEnum.enumValues).optional(),
  status: z.enum(copyStatusEnum.enumValues).optional(),
  note: z.string().trim().max(300).nullable().optional(),
});

export async function editCopy(copyId: string, patch: z.input<typeof copyPatch>) {
  return run(async () => {
    const user = await authorize("books:manage");
    const data = copyPatch.parse(patch);
    const res = await updateCopy({ libraryId: user.library.id, copyId, ...data, actorId: user.id });
    revalidatePath("/", "layout");
    const { t, tk } = await getI18n();
    return { message: res.what === "unchanged" ? t("actions.noChanges") : tk(`activity.copyUpdate.${res.what}`, { barcode: res.barcode, title: res.title, condition: data.condition ? tk(`conditions.${data.condition}`) : "" }) };
  });
}

const CSV_COLUMNS: Record<string, keyof BookInput> = {
  title: "title",
  author: "author",
  isbn: "isbn",
  genre: "genre",
  tags: "tags",
  year: "publishedYear",
  published_year: "publishedYear",
  publishedyear: "publishedYear",
  publisher: "publisher",
  pages: "pages",
  language: "language",
  description: "description",
  cover_url: "coverUrl",
  coverurl: "coverUrl",
  copies: "copies",
  total_copies: "copies",
  totalcopies: "copies",
  location: "location",
  shelf: "location",
};

export async function importBooksCsv(csv: string) {
  return run(async () => {
    const user = await authorize("books:manage");
    const i18n = await getI18n();
    const { t } = i18n;
    const rows = parseCsv(csv);
    if (rows.length < 2) throw new LibraryError("errors.csvEmpty");
    const header = rows[0].map((h) => CSV_COLUMNS[h.trim().toLowerCase().replace(/\s+/g, "_")]);
    if (!header.includes("title") || !header.includes("author")) {
      throw new LibraryError("errors.csvHeader");
    }

    const valid: ReturnType<typeof bookInput.parse>[] = [];
    const errors: string[] = [];
    rows.slice(1).forEach((cells, i) => {
      if (cells.every((c) => !c.trim())) return;
      const record: Record<string, string> = { copies: "1" };
      header.forEach((key, j) => {
        if (key && cells[j]?.trim()) record[key] = key === "tags" ? cells[j].replace(/;/g, ",") : cells[j];
      });
      const parsed = bookInput.safeParse(record);
      if (parsed.success) valid.push(parsed.data);
      else {
        const msg = parsed.error.issues[0]?.message ?? "";
        errors.push(t("actions.csvRow", { row: i + 2, error: translateIssue(i18n, msg) }));
      }
    });
    if (!valid.length) {
      if (errors[0]) throw new LibraryError("errors.csvRowError", { error: errors[0] });
      throw new LibraryError("errors.csvNoRows");
    }
    if (valid.length > 500) throw new LibraryError("errors.csvTooMany");

    const db = await getDb();
    const copyCount = await db.transaction(async (tx) => {
      const created = await tx
        .insert(books)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .values(valid.map(({ copies: _c, ...b }) => ({ ...b, libraryId: user.library.id, createdById: user.id })))
        .returning({ id: books.id });
      let n = 0;
      for (const [i, b] of created.entries()) {
        await addCopies({ libraryId: user.library.id, bookId: b.id, count: valid[i].copies, condition: "new", actorId: null }, tx);
        n += valid[i].copies;
      }
      await tx.insert(activity).values({
        libraryId: user.library.id,
        actorId: user.id,
        action: "book.import",
        ...activityText("activity.bookImport", { member: user.name, count: valid.length, copies: n }),
      });
      return n;
    });
    revalidatePath("/", "layout");
    const imported = t("actions.imported", { count: valid.length, copies: copyCount });
    return { message: errors.length ? t("actions.importedSkipped", { message: imported, count: errors.length, errors: errors.slice(0, 2).join("; ") }) : imported };
  });
}
