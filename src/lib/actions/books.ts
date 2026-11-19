"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { activity, books, loans } from "@/lib/db/schema";
import { processHoldQueue, LibraryError } from "@/lib/library";
import { authorize } from "@/lib/session";
import { bookInput, type BookInput } from "@/lib/validation";
import { parseCsv } from "@/lib/csv";
import { run } from "./result";

export async function createBook(input: BookInput) {
  return run(async () => {
    const user = await authorize("books:manage");
    const data = bookInput.parse(input);
    const db = await getDb();
    const [book] = await db.insert(books).values({ ...data, createdById: user.id }).returning();
    await db.insert(activity).values({
      actorId: user.id,
      action: "book.create",
      bookId: book.id,
      message: `${user.name} added “${book.title}”`,
    });
    revalidatePath("/", "layout");
    return { message: `Added “${book.title}”`, data: { id: book.id } };
  });
}

export async function updateBook(id: string, input: BookInput) {
  return run(async () => {
    const user = await authorize("books:manage");
    const data = bookInput.parse(input);
    const db = await getDb();
    const [{ out }] = await db
      .select({ out: sql<number>`count(*)::int` })
      .from(loans)
      .where(and(eq(loans.bookId, id), isNull(loans.returnedAt)));
    if (data.totalCopies < out) {
      throw new LibraryError(`${out} copies are currently on loan, so the total can't be lower than that.`);
    }
    const [book] = await db
      .update(books)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(books.id, id))
      .returning();
    if (!book) throw new LibraryError("Book not found.");
    await processHoldQueue(db, id); // more copies may free someone on the waitlist
    await db.insert(activity).values({
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
    const db = await getDb();
    const book = await db.query.books.findFirst({ where: eq(books.id, id) });
    if (!book) throw new LibraryError("Book not found.");
    const out = await db.query.loans.findFirst({ where: and(eq(loans.bookId, id), isNull(loans.returnedAt)) });
    if (out) throw new LibraryError("This book is on loan. Check all copies in before deleting it.");
    await db.delete(books).where(eq(books.id, id));
    await db.insert(activity).values({
      actorId: user.id,
      action: "book.delete",
      message: `${user.name} deleted “${book.title}”`,
    });
    revalidatePath("/", "layout");
    return { message: `Deleted “${book.title}”` };
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
  copies: "totalCopies",
  total_copies: "totalCopies",
  totalcopies: "totalCopies",
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
      const record: Record<string, string> = { totalCopies: "1" };
      header.forEach((key, j) => {
        if (key && cells[j]?.trim()) record[key] = key === "tags" ? cells[j].replace(/;/g, ",") : cells[j];
      });
      const parsed = bookInput.safeParse(record);
      if (parsed.success) valid.push(parsed.data);
      else errors.push(`Row ${i + 2}: ${parsed.error.issues[0]?.message}`);
    });
    if (!valid.length) throw new LibraryError(errors[0] ?? "No valid rows found.");

    const db = await getDb();
    await db.insert(books).values(valid.map((b) => ({ ...b, createdById: user.id })));
    await db.insert(activity).values({
      actorId: user.id,
      action: "book.import",
      message: `${user.name} imported ${valid.length} book${valid.length === 1 ? "" : "s"} from CSV`,
    });
    revalidatePath("/", "layout");
    const skipped = errors.length ? ` (${errors.length} row${errors.length === 1 ? "" : "s"} skipped: ${errors.slice(0, 2).join("; ")})` : "";
    return { message: `Imported ${valid.length} book${valid.length === 1 ? "" : "s"}${skipped}` };
  });
}
