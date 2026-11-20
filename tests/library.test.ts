import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { copies, holds, notifications } from "@/lib/db/schema";
import {
  addCopies,
  addFine,
  borrowBook,
  cancelHold,
  checkInByBarcode,
  getBalance,
  getBook,
  markLoanLost,
  placeHold,
  processHoldQueue,
  renewLoan,
  resolveFine,
  returnLoan,
  searchBooks,
  updateCopy,
} from "@/lib/library";
import { generateReminders } from "@/lib/reminders";
import { DAY, makeBook, makeHold, makeLibrary, makeLoan, makeUser, openLoans, resetDb } from "./helpers/db";
import type { DB } from "@/lib/db/client";
import type { Library } from "@/lib/db/schema";

// Point the library code at a fresh in-memory Postgres instead of the app database.
vi.mock("@/lib/db/client", async () => {
  const { createTestDb } = await import("./helpers/db");
  const db = createTestDb();
  return { getDb: () => db };
});

let db: DB;
let lib: Library; // default rules: 14 days, 5 books, 2 renewals, 3-day pickup, $0.25/day, cap $10, block at $5

beforeAll(async () => {
  db = await getDb();
});

beforeEach(async () => {
  await resetDb(db);
  lib = await makeLibrary(db);
});

async function holdStatus(holdId: string) {
  const hold = await db.query.holds.findFirst({ where: eq(holds.id, holdId) });
  return hold?.status;
}

async function available(bookId: string, libraryId = lib.id) {
  const [book] = await searchBooks({ libraryId, q: "", sort: "title" }).then((list) => list.filter((b) => b.id === bookId));
  return book.available;
}

const borrow = (bookId: string, userId: string, extra: { actorId?: string; barcode?: string; libraryId?: string } = {}) =>
  borrowBook({ libraryId: extra.libraryId ?? lib.id, bookId, userId, actorId: extra.actorId ?? userId, barcode: extra.barcode });

describe("borrowing", () => {
  it("lends a copy for the library's loan period and reduces availability", async () => {
    const member = await makeUser(db, lib.id);
    const book = await makeBook(db, lib.id, 2);

    const before = Date.now();
    const { loan, barcode } = await borrow(book.id, member.id);

    const days = (loan.dueAt.getTime() - before) / DAY;
    expect(days).toBeGreaterThan(13.99);
    expect(days).toBeLessThan(14.01);
    expect(barcode).toMatch(new RegExp(`^${lib.code}-`));
    expect(loan.issuedById).toBeNull();
    expect(await available(book.id)).toBe(1);
  });

  it("uses each library's own rules", async () => {
    const riverside = await makeLibrary(db, { loanDays: 21, maxLoans: 1 });
    const member = await makeUser(db, riverside.id);
    const [a, b] = [await makeBook(db, riverside.id), await makeBook(db, riverside.id)];

    const { loan } = await borrow(a.id, member.id, { libraryId: riverside.id });
    expect(Math.round((loan.dueAt.getTime() - loan.borrowedAt.getTime()) / DAY)).toBe(21);
    await expect(borrow(b.id, member.id, { libraryId: riverside.id })).rejects.toThrow(/Loan limit reached \(1 books/);
  });

  it("records the librarian and the exact copy when staff check a book out", async () => {
    const member = await makeUser(db, lib.id);
    const librarian = await makeUser(db, lib.id, "librarian");
    const book = await makeBook(db, lib.id, 3);
    const all = await db.query.copies.findMany({ where: eq(copies.bookId, book.id) });

    const { loan, barcode } = await borrow(book.id, member.id, { actorId: librarian.id, barcode: all[2].barcode.toLowerCase() });

    expect(loan.issuedById).toBe(librarian.id);
    expect(barcode).toBe(all[2].barcode);
    expect(loan.copyId).toBe(all[2].id);
  });

  it("never lends a withdrawn or lost copy", async () => {
    const member = await makeUser(db, lib.id);
    const book = await makeBook(db, lib.id, 2);
    const all = await db.query.copies.findMany({ where: eq(copies.bookId, book.id) });
    await db.update(copies).set({ status: "withdrawn" }).where(eq(copies.id, all[0].id));
    await db.update(copies).set({ status: "lost" }).where(eq(copies.id, all[1].id));

    expect(await available(book.id)).toBe(0);
    await expect(borrow(book.id, member.id)).rejects.toThrow(/No copies available/);
  });

  it("refuses when every copy is on loan", async () => {
    const [a, b] = [await makeUser(db, lib.id), await makeUser(db, lib.id)];
    const book = await makeBook(db, lib.id, 1);
    await borrow(book.id, a.id);

    await expect(borrow(book.id, b.id)).rejects.toThrow(/No copies available/);
  });

  it("refuses a second copy of a book the member already has", async () => {
    const member = await makeUser(db, lib.id);
    const book = await makeBook(db, lib.id, 3);
    await borrow(book.id, member.id);

    await expect(borrow(book.id, member.id)).rejects.toThrow(/already has this book/);
  });

  it("enforces the loan limit", async () => {
    const member = await makeUser(db, lib.id);
    for (let i = 0; i < lib.maxLoans; i++) await borrow((await makeBook(db, lib.id)).id, member.id);

    await expect(borrow((await makeBook(db, lib.id)).id, member.id)).rejects.toThrow(/Loan limit reached/);
  });

  it("blocks new loans while the member has an overdue book", async () => {
    const member = await makeUser(db, lib.id);
    await makeLoan(db, lib.id, (await makeBook(db, lib.id)).id, member.id, -3);
    const book = await makeBook(db, lib.id);

    await expect(borrow(book.id, member.id)).rejects.toThrow(/overdue/);
    expect(await openLoans(db, book.id)).toHaveLength(0);
  });

  it("blocks new loans while unpaid fines reach the library's limit", async () => {
    const member = await makeUser(db, lib.id);
    const librarian = await makeUser(db, lib.id, "librarian");
    const book = await makeBook(db, lib.id);
    await addFine({ libraryId: lib.id, userId: member.id, amountCents: lib.blockAtCents - 1, reason: "damaged", actorId: librarian.id });
    const { loan } = await borrow(book.id, member.id); // just under the limit: fine
    await returnLoan({ libraryId: lib.id, loanId: loan.id, actorId: member.id, isStaff: false });

    const { fine } = await addFine({ libraryId: lib.id, userId: member.id, amountCents: 1, reason: "damaged", actorId: librarian.id });
    await expect(borrow(book.id, member.id)).rejects.toThrow(/Unpaid fines of \$5\.00/);

    await resolveFine({ libraryId: lib.id, fineId: fine!.id, outcome: "paid", actorId: librarian.id });
    await expect(borrow(book.id, member.id)).resolves.toBeTruthy();
  });

  it("never lends the last copy twice when two requests arrive together", async () => {
    const [a, b] = [await makeUser(db, lib.id), await makeUser(db, lib.id)];
    const book = await makeBook(db, lib.id, 1);

    const results = await Promise.allSettled([borrow(book.id, a.id), borrow(book.id, b.id)]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await openLoans(db, book.id)).toHaveLength(1);
  });
});

describe("returning and fines", () => {
  it("closes the loan and frees the copy, with no fee when on time", async () => {
    const member = await makeUser(db, lib.id);
    const book = await makeBook(db, lib.id);
    const { loan } = await borrow(book.id, member.id);

    const result = await returnLoan({ libraryId: lib.id, loanId: loan.id, actorId: member.id, isStaff: false });

    expect(result).toMatchObject({ late: false, fineCents: 0 });
    expect(await openLoans(db, book.id)).toHaveLength(0);
    expect(await available(book.id)).toBe(1);
  });

  it("charges a late fee per calendar day and notifies the member", async () => {
    const member = await makeUser(db, lib.id);
    const loan = await makeLoan(db, lib.id, (await makeBook(db, lib.id)).id, member.id, -3);

    const result = await returnLoan({ libraryId: lib.id, loanId: loan.id, actorId: member.id, isStaff: false });

    expect(result).toMatchObject({ late: true, fineCents: 3 * lib.finePerDayCents });
    expect(await getBalance(db, lib.id, member.id)).toBe(75);
    const note = await db.query.notifications.findFirst({ where: and(eq(notifications.userId, member.id), eq(notifications.kind, "fine")) });
    expect(note?.title).toBe("$0.75 late fee");
  });

  it("applies the grace period and the cap", async () => {
    const strict = await makeLibrary(db, { finePerDayCents: 100, fineGraceDays: 2, maxFineCents: 500 });
    const member = await makeUser(db, strict.id);
    const twoLate = await makeLoan(db, strict.id, (await makeBook(db, strict.id)).id, member.id, -2);
    const monthLate = await makeLoan(db, strict.id, (await makeBook(db, strict.id)).id, member.id, -30);

    expect((await returnLoan({ libraryId: strict.id, loanId: twoLate.id, actorId: member.id, isStaff: false })).fineCents).toBe(0);
    expect((await returnLoan({ libraryId: strict.id, loanId: monthLate.id, actorId: member.id, isStaff: false })).fineCents).toBe(500);
  });

  it("checks in by barcode and records the copy's condition", async () => {
    const member = await makeUser(db, lib.id);
    const librarian = await makeUser(db, lib.id, "librarian");
    const book = await makeBook(db, lib.id);
    const { barcode } = await borrow(book.id, member.id);

    await checkInByBarcode({ libraryId: lib.id, barcode: barcode.toLowerCase(), actorId: librarian.id, condition: "damaged" });

    const copy = await db.query.copies.findFirst({ where: eq(copies.barcode, barcode) });
    expect(copy?.condition).toBe("damaged");
    await expect(checkInByBarcode({ libraryId: lib.id, barcode, actorId: librarian.id })).rejects.toThrow(/isn't on loan/);
    await expect(checkInByBarcode({ libraryId: lib.id, barcode: "NOPE-1", actorId: librarian.id })).rejects.toThrow(/No copy with barcode/);
  });

  it("refuses to return the same loan twice", async () => {
    const member = await makeUser(db, lib.id);
    const loan = await makeLoan(db, lib.id, (await makeBook(db, lib.id)).id, member.id);
    await returnLoan({ libraryId: lib.id, loanId: loan.id, actorId: member.id, isStaff: false });

    await expect(returnLoan({ libraryId: lib.id, loanId: loan.id, actorId: member.id, isStaff: false })).rejects.toThrow(/already returned/);
  });

  it("lets members return only their own books, and staff return anyone's", async () => {
    const [owner, other] = [await makeUser(db, lib.id), await makeUser(db, lib.id)];
    const librarian = await makeUser(db, lib.id, "librarian");
    const loan = await makeLoan(db, lib.id, (await makeBook(db, lib.id)).id, owner.id);

    await expect(returnLoan({ libraryId: lib.id, loanId: loan.id, actorId: other.id, isStaff: false })).rejects.toThrow(/your own books/);
    await expect(returnLoan({ libraryId: lib.id, loanId: loan.id, actorId: librarian.id, isStaff: true })).resolves.toBeTruthy();
  });

  it("settles a fine only once", async () => {
    const member = await makeUser(db, lib.id);
    const librarian = await makeUser(db, lib.id, "librarian");
    const { fine } = await addFine({ libraryId: lib.id, userId: member.id, amountCents: 300, reason: "damaged", actorId: librarian.id });

    await resolveFine({ libraryId: lib.id, fineId: fine!.id, outcome: "waived", actorId: librarian.id });

    expect(await getBalance(db, lib.id, member.id)).toBe(0);
    await expect(resolveFine({ libraryId: lib.id, fineId: fine!.id, outcome: "paid", actorId: librarian.id })).rejects.toThrow(/already settled/);
  });
});

describe("copies", () => {
  it("gives new copies the next barcodes in the library's sequence", async () => {
    const librarian = await makeUser(db, lib.id, "librarian");
    const book = await makeBook(db, lib.id, 0);

    const first = await addCopies({ libraryId: lib.id, bookId: book.id, count: 2, actorId: librarian.id });
    const second = await addCopies({ libraryId: lib.id, bookId: book.id, count: 1, actorId: librarian.id });

    expect(first.barcodes).toEqual([`${lib.code}-00001`, `${lib.code}-00002`]);
    expect(second.barcodes).toEqual([`${lib.code}-00003`]);
    expect(await available(book.id)).toBe(3);
  });

  it("new copies go straight to the waitlist", async () => {
    const [reader, waiter] = [await makeUser(db, lib.id), await makeUser(db, lib.id)];
    const book = await makeBook(db, lib.id, 1);
    await makeLoan(db, lib.id, book.id, reader.id);
    const hold = await makeHold(db, lib.id, book.id, waiter.id, 5);

    await addCopies({ libraryId: lib.id, bookId: book.id, count: 1, actorId: null });

    expect(await holdStatus(hold.id)).toBe("ready");
  });

  it("can't withdraw a copy that is on loan", async () => {
    const member = await makeUser(db, lib.id);
    const librarian = await makeUser(db, lib.id, "librarian");
    const book = await makeBook(db, lib.id);
    const { loan } = await borrow(book.id, member.id);

    await expect(updateCopy({ libraryId: lib.id, copyId: loan.copyId, status: "withdrawn", actorId: librarian.id })).rejects.toThrow(/is on loan/);
  });

  it("marking a loan lost closes it, retires the copy and charges the lost-item fee", async () => {
    const member = await makeUser(db, lib.id);
    const librarian = await makeUser(db, lib.id, "librarian");
    const book = await makeBook(db, lib.id, 2);
    const { loan } = await borrow(book.id, member.id);

    const res = await markLoanLost({ libraryId: lib.id, loanId: loan.id, actorId: librarian.id });

    expect(res.feeCents).toBe(lib.lostItemFeeCents);
    expect((await db.query.copies.findFirst({ where: eq(copies.id, loan.copyId) }))?.status).toBe("lost");
    expect(await openLoans(db, book.id)).toHaveLength(0);
    expect(await getBalance(db, lib.id, member.id)).toBe(lib.lostItemFeeCents);
    // One copy left in circulation.
    expect((await getBook(lib.id, book.id))?.book.totalCopies).toBe(1);
  });
});

describe("renewing", () => {
  it("extends the due date by the loan period, at most maxRenewals times", async () => {
    const member = await makeUser(db, lib.id);
    const loan = await makeLoan(db, lib.id, (await makeBook(db, lib.id)).id, member.id, 5);

    const first = await renewLoan({ libraryId: lib.id, loanId: loan.id, actorId: member.id, isStaff: false });
    expect(first.dueAt.getTime() - loan.dueAt.getTime()).toBe(lib.loanDays * DAY);

    await renewLoan({ libraryId: lib.id, loanId: loan.id, actorId: member.id, isStaff: false });
    await expect(renewLoan({ libraryId: lib.id, loanId: loan.id, actorId: member.id, isStaff: false })).rejects.toThrow(/already been renewed/);
  });

  it("counts an overdue renewal from today, not from the old due date", async () => {
    const member = await makeUser(db, lib.id);
    const loan = await makeLoan(db, lib.id, (await makeBook(db, lib.id)).id, member.id, -4);

    const before = Date.now();
    const { dueAt } = await renewLoan({ libraryId: lib.id, loanId: loan.id, actorId: member.id, isStaff: false });

    expect(dueAt.getTime()).toBeGreaterThanOrEqual(before + lib.loanDays * DAY);
  });

  it("is blocked while someone is waiting for the book", async () => {
    const [reader, waiter] = [await makeUser(db, lib.id), await makeUser(db, lib.id)];
    const book = await makeBook(db, lib.id, 1);
    const loan = await makeLoan(db, lib.id, book.id, reader.id);
    await placeHold({ libraryId: lib.id, bookId: book.id, userId: waiter.id });

    await expect(renewLoan({ libraryId: lib.id, loanId: loan.id, actorId: reader.id, isStaff: false })).rejects.toThrow(/Someone is waiting/);
  });
});

describe("waitlist", () => {
  it("queues members in order and reports their position", async () => {
    const [reader, first, second] = [await makeUser(db, lib.id), await makeUser(db, lib.id), await makeUser(db, lib.id)];
    const book = await makeBook(db, lib.id, 1);
    await makeLoan(db, lib.id, book.id, reader.id);

    expect((await placeHold({ libraryId: lib.id, bookId: book.id, userId: first.id })).position).toBe(1);
    expect((await placeHold({ libraryId: lib.id, bookId: book.id, userId: second.id })).position).toBe(2);
    await expect(placeHold({ libraryId: lib.id, bookId: book.id, userId: first.id })).rejects.toThrow(/already on the waitlist/);
    await expect(placeHold({ libraryId: lib.id, bookId: book.id, userId: reader.id })).rejects.toThrow(/already have this book/);
  });

  it("reserves a returned copy for the first in line, for the library's pickup window, and tells them", async () => {
    const [reader, first, second] = [await makeUser(db, lib.id), await makeUser(db, lib.id), await makeUser(db, lib.id)];
    const book = await makeBook(db, lib.id, 1);
    const loan = await makeLoan(db, lib.id, book.id, reader.id);
    const h1 = await makeHold(db, lib.id, book.id, first.id, 10);
    const h2 = await makeHold(db, lib.id, book.id, second.id, 5);

    await returnLoan({ libraryId: lib.id, loanId: loan.id, actorId: reader.id, isStaff: false });

    const ready = await db.query.holds.findFirst({ where: eq(holds.id, h1.id) });
    expect(ready?.status).toBe("ready");
    expect((ready!.expiresAt!.getTime() - ready!.readyAt!.getTime()) / DAY).toBe(lib.holdPickupDays);
    expect(await holdStatus(h2.id)).toBe("waiting");
    expect(await available(book.id)).toBe(0);
    const note = await db.query.notifications.findFirst({ where: and(eq(notifications.userId, first.id), eq(notifications.kind, "hold_ready")) });
    expect(note?.href).toBe(`/books/${book.id}`);
  });

  it("keeps a reserved copy for its holder only", async () => {
    const [reader, holder, stranger] = [await makeUser(db, lib.id), await makeUser(db, lib.id), await makeUser(db, lib.id)];
    const book = await makeBook(db, lib.id, 1);
    const loan = await makeLoan(db, lib.id, book.id, reader.id);
    const hold = await makeHold(db, lib.id, book.id, holder.id, 10);
    await returnLoan({ libraryId: lib.id, loanId: loan.id, actorId: reader.id, isStaff: false });

    await expect(borrow(book.id, stranger.id)).rejects.toThrow(/reserved for members on the waitlist/);
    await borrow(book.id, holder.id);
    expect(await holdStatus(hold.id)).toBe("fulfilled");
  });

  it("expires reservations that were not picked up and moves to the next person", async () => {
    const [reader, first, second] = [await makeUser(db, lib.id), await makeUser(db, lib.id), await makeUser(db, lib.id)];
    const book = await makeBook(db, lib.id, 1);
    const loan = await makeLoan(db, lib.id, book.id, reader.id);
    const h1 = await makeHold(db, lib.id, book.id, first.id, 10);
    const h2 = await makeHold(db, lib.id, book.id, second.id, 5);
    await returnLoan({ libraryId: lib.id, loanId: loan.id, actorId: reader.id, isStaff: false });

    await db.update(holds).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(holds.id, h1.id));
    await processHoldQueue(db, book.id);

    expect(await holdStatus(h1.id)).toBe("expired");
    expect(await holdStatus(h2.id)).toBe("ready");
  });

  it("passes a reservation on when its holder cancels", async () => {
    const [reader, first, second] = [await makeUser(db, lib.id), await makeUser(db, lib.id), await makeUser(db, lib.id)];
    const book = await makeBook(db, lib.id, 1);
    const loan = await makeLoan(db, lib.id, book.id, reader.id);
    const h1 = await makeHold(db, lib.id, book.id, first.id, 10);
    const h2 = await makeHold(db, lib.id, book.id, second.id, 5);
    await returnLoan({ libraryId: lib.id, loanId: loan.id, actorId: reader.id, isStaff: false });

    await expect(cancelHold({ libraryId: lib.id, holdId: h1.id, actorId: second.id, isStaff: false })).rejects.toThrow(/your own holds/);
    await cancelHold({ libraryId: lib.id, holdId: h1.id, actorId: first.id, isStaff: false });

    expect(await holdStatus(h2.id)).toBe("ready");
  });
});

describe("libraries are isolated from each other", () => {
  it("search, book pages and circulation only see the current library", async () => {
    const other = await makeLibrary(db);
    const member = await makeUser(db, lib.id);
    const theirs = await makeBook(db, other.id, 1, "Only Over There");
    const theirMember = await makeUser(db, other.id);
    const theirLoan = await makeLoan(db, other.id, (await makeBook(db, other.id)).id, theirMember.id);

    expect(await searchBooks({ libraryId: lib.id, q: "Only Over There" })).toHaveLength(0);
    expect(await getBook(lib.id, theirs.id)).toBeNull();
    await expect(borrow(theirs.id, member.id)).rejects.toThrow(/no longer exists/);
    await expect(returnLoan({ libraryId: lib.id, loanId: theirLoan.id, actorId: member.id, isStaff: true })).rejects.toThrow(/Loan not found/);
  });

  it("only members of a library can borrow there", async () => {
    const other = await makeLibrary(db);
    const outsider = await makeUser(db, other.id);
    const book = await makeBook(db, lib.id);

    await expect(borrow(book.id, outsider.id)).rejects.toThrow(/isn't a member of this library/);
    await expect(placeHold({ libraryId: lib.id, bookId: book.id, userId: outsider.id })).rejects.toThrow(/aren't a member/);
  });
});

describe("reminders", () => {
  it("creates due-soon and overdue reminders once, however often the job runs", async () => {
    const member = await makeUser(db, lib.id);
    const dueSoon = await makeLoan(db, lib.id, (await makeBook(db, lib.id, 1, "Due Soon")).id, member.id, 1);
    await makeLoan(db, lib.id, (await makeBook(db, lib.id, 1, "Way Late")).id, member.id, -9);
    await makeLoan(db, lib.id, (await makeBook(db, lib.id, 1, "Far Off")).id, member.id, 10);

    const first = await generateReminders(db);
    const again = await generateReminders(db);

    expect(first.created).toBe(2);
    expect(again.created).toBe(0);
    const rows = await db.query.notifications.findMany({ where: eq(notifications.userId, member.id) });
    expect(rows.map((n) => n.kind).sort()).toEqual(["due_soon", "overdue"]);
    expect(rows.find((n) => n.kind === "overdue")?.title).toBe("“Way Late” is 9 days overdue");
    expect(rows.find((n) => n.kind === "due_soon")?.dedupeKey).toContain(dueSoon.id);
  });
});

describe("demo seed", () => {
  const rows = async (query: SQL) => {
    const res = await db.execute(query);
    return (Array.isArray(res) ? res : (res as unknown as { rows: unknown[] }).rows) as unknown[];
  };

  it("builds two libraries with consistent data, and resets to the same state", async () => {
    const { seed } = await import("@/lib/db/seed");
    const first = await seed(db, { reset: true });
    const again = await seed(db, { reset: true });

    expect(again).toEqual(first);
    expect(first.libraries).toBe(2);
    // No copy is on two open loans, open loans are on active copies, and nothing crosses libraries.
    expect(await rows(sql`select copy_id from loans where returned_at is null group by copy_id having count(*) > 1`)).toHaveLength(0);
    expect(await rows(sql`select l.id from loans l join copies c on c.id = l.copy_id where l.returned_at is null and c.status <> 'active'`)).toHaveLength(0);
    expect(await rows(sql`select l.id from loans l join copies c on c.id = l.copy_id where c.book_id <> l.book_id`)).toHaveLength(0);
    expect(await rows(sql`select l.id from loans l join books b on b.id = l.book_id where l.library_id <> b.library_id`)).toHaveLength(0);
    expect(await rows(sql`select h.id from holds h join books b on b.id = h.book_id where h.library_id <> b.library_id`)).toHaveLength(0);
  });

  it("removes non-demo accounts on reset and keeps the demo accounts' ids", async () => {
    const { seed, DEMO_LOGINS } = await import("@/lib/db/seed");
    await seed(db, { reset: true });
    const demoIds = await rows(sql`select id from users where is_demo order by email`);
    const lib = (await db.query.libraries.findFirst())!;
    await makeUser(db, lib.id, "admin"); // e.g. someone an admin added during the day

    await seed(db, { reset: true });
    expect(await rows(sql`select id from users where not is_demo`)).toHaveLength(0);
    expect(await rows(sql`select id from users where is_demo order by email`)).toEqual(demoIds);
    for (const email of Object.values(DEMO_LOGINS)) {
      expect(await rows(sql`select u.id from users u join memberships m on m.user_id = u.id where u.email = ${email}`)).not.toHaveLength(0);
    }
  });

  it("feeds the dashboard and reports", async () => {
    const { seed } = await import("@/lib/db/seed");
    const { getLibraryStats, getReport, getLoanRows, getFineRows } = await import("@/lib/stats");
    await seed(db, { reset: true });
    const central = (await db.query.libraries.findFirst({ where: (l, { eq: is }) => is(l.slug, "central") }))!;

    const stats = await getLibraryStats(central.id);
    expect(stats).toMatchObject({ titles: 40, onLoan: 11, overdue: 3 });

    for (const days of [30, 90, 365] as const) {
      const report = await getReport(central.id, days);
      expect(report.summary.loans).toBeGreaterThan(0);
      expect(report.periods.reduce((s, p) => s + p.loans, 0)).toBe(report.summary.loans);
      expect(report.summary.finesOutstanding).toBeGreaterThan(0);
    }
    expect((await getLoanRows(central.id, 90)).length).toBe((await getReport(central.id, 90)).summary.loans);
    expect((await getFineRows(central.id, 365)).length).toBeGreaterThan(0);
  });
});
