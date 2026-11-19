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
import { run } from "./result";

async function ownBook(libraryId: string, id: string) {
  const db = await getDb();
  const book = await db.query.books.findFirst({ where: and(eq(books.id, id), eq(books.libraryId, libraryId)) });
  if (!book) throw new LibraryError("Book not found.");
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
        message: `${user.name} added “${created.title}”`,
      });
      await addCopies({ libraryId: user.library.id, bookId: created.id, count, condition: "new", actorId: null }, tx);
      return created;
    });
    revalidatePath("/", "layout");
    return { message: `Added “${book.title}” with ${count} cop${count === 1 ? "y" : "ies"}`, data: { id: book.id } };
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
      message: `${user.name} updated “${book.title}”`,
    });
    revalidatePath("/", "layout");
    return { message: "Changes saved", data: { id } };
  });
}

export async function deleteBook(id: string) {
  return run(async () => {
    const user = await authorize("books:manage");
    const book = await ownBook(user.library.id, id);
    const db = await getDb();
    const out = await db.query.loans.findFirst({ where: and(eq(loans.bookId, id), isNull(loans.returnedAt)) });
    if (out) throw new LibraryError("This book is on loan. Check all copies in before deleting it.");
    await db.delete(books).where(eq(books.id, id));
    await db.insert(activity).values({
      libraryId: user.library.id,
      actorId: user.id,
      action: "book.delete",
      message: `${user.name} deleted “${book.title}”`,
    });
    revalidatePath("/", "layout");
    return { message: `Deleted “${book.title}”` };
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
    return { message: `Added ${res.barcodes.length === 1 ? `copy ${res.barcodes[0]}` : `copies ${res.barcodes[0]} to ${res.barcodes.at(-1)}`}` };
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
    return { message: res.what === "unchanged" ? "No changes" : `Copy ${res.barcode} ${res.what}` };
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
    const rows = parseCsv(csv);
    if (rows.length < 2) throw new LibraryError("The file needs a header row and at least one book.");
    const header = rows[0].map((h) => CSV_COLUMNS[h.trim().toLowerCase().replace(/\s+/g, "_")]);
    if (!header.includes("title") || !header.includes("author")) {
      throw new LibraryError("The header row must include at least “title” and “author”.");
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
      else errors.push(`Row ${i + 2}: ${parsed.error.issues[0]?.message}`);
    });
    if (!valid.length) throw new LibraryError(errors[0] ?? "No valid rows found.");
    if (valid.length > 500) throw new LibraryError("Import at most 500 books at a time.");

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
        message: `${user.name} imported ${valid.length} book${valid.length === 1 ? "" : "s"} (${n} copies) from CSV`,
      });
      return n;
    });
    revalidatePath("/", "layout");
    const skipped = errors.length ? ` (${errors.length} row${errors.length === 1 ? "" : "s"} skipped: ${errors.slice(0, 2).join("; ")})` : "";
    return { message: `Imported ${valid.length} book${valid.length === 1 ? "" : "s"} with ${copyCount} copies${skipped}` };
  });
}
