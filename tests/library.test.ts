import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { activity, books, holds, loans } from "@/lib/db/schema";
import {
  HOLD_PICKUP_DAYS,
  LOAN_DAYS,
  MAX_ACTIVE_LOANS,
  MAX_RENEWALS,
  borrowBook,
  cancelHold,
  placeHold,
  processHoldQueue,
  renewLoan,
  returnLoan,
  searchBooks,
} from "@/lib/library";
import { DAY, makeBook, makeHold, makeLoan, makeUser, resetDb } from "./helpers/db";
import type { DB } from "@/lib/db/client";

// Point the library code at a fresh in-memory Postgres instead of the app database.
vi.mock("@/lib/db/client", async () => {
  const { createTestDb } = await import("./helpers/db");
  const db = createTestDb();
  return { getDb: () => db };
});

let db: DB;

beforeAll(async () => {
  db = await getDb();
});

beforeEach(async () => {
  await resetDb(db);
});

async function activeLoans(bookId: string) {
  return db.query.loans.findMany({ where: and(eq(loans.bookId, bookId), isNull(loans.returnedAt)) });
}

async function holdStatus(holdId: string) {
  const hold = await db.query.holds.findFirst({ where: eq(holds.id, holdId) });
  return hold?.status;
}

async function available(bookId: string) {
  const [book] = await searchBooks({ q: "", sort: "title" }).then((list) => list.filter((b) => b.id === bookId));
  return book.available;
}

describe("borrowing", () => {
  it("creates a 14-day loan and reduces availability", async () => {
    const member = await makeUser(db);
    const book = await makeBook(db, 2);

    const before = Date.now();
    const { loan } = await borrowBook({ bookId: book.id, userId: member.id, actorId: member.id });

    const days = (loan.dueAt.getTime() - before) / DAY;
    expect(days).toBeGreaterThan(LOAN_DAYS - 0.01);
    expect(days).toBeLessThan(LOAN_DAYS + 0.01);
    expect(loan.issuedById).toBeNull();
    expect(await available(book.id)).toBe(1);
  });

  it("records the librarian when staff check a book out to a member", async () => {
    const member = await makeUser(db);
    const librarian = await makeUser(db, "librarian");
    const book = await makeBook(db);

    const { loan } = await borrowBook({ bookId: book.id, userId: member.id, actorId: librarian.id });

    expect(loan.userId).toBe(member.id);
    expect(loan.issuedById).toBe(librarian.id);
    const log = await db.query.activity.findFirst({ where: eq(activity.action, "loan.borrow") });
    expect(log?.message).toContain("checked out to");
  });

  it("refuses when every copy is on loan", async () => {
    const [a, b] = [await makeUser(db), await makeUser(db)];
    const book = await makeBook(db, 1);
    await borrowBook({ bookId: book.id, userId: a.id, actorId: a.id });

    await expect(borrowBook({ bookId: book.id, userId: b.id, actorId: b.id })).rejects.toThrow(/No copies available/);
  });

  it("refuses a second copy of a book the member already has", async () => {
    const member = await makeUser(db);
    const book = await makeBook(db, 3);
    await borrowBook({ bookId: book.id, userId: member.id, actorId: member.id });

    await expect(borrowBook({ bookId: book.id, userId: member.id, actorId: member.id })).rejects.toThrow(/already has this book/);
  });

  it(`enforces the ${MAX_ACTIVE_LOANS}-book limit`, async () => {
    const member = await makeUser(db);
    for (let i = 0; i < MAX_ACTIVE_LOANS; i++) {
      const book = await makeBook(db);
      await borrowBook({ bookId: book.id, userId: member.id, actorId: member.id });
    }
    const oneMore = await makeBook(db);

    await expect(borrowBook({ bookId: oneMore.id, userId: member.id, actorId: member.id })).rejects.toThrow(/Loan limit reached/);
  });

  it("blocks new loans while the member has an overdue book", async () => {
    const member = await makeUser(db);
    await makeLoan(db, (await makeBook(db)).id, member.id, -3);
    const book = await makeBook(db);

    await expect(borrowBook({ bookId: book.id, userId: member.id, actorId: member.id })).rejects.toThrow(/overdue/);
    expect(await activeLoans(book.id)).toHaveLength(0);
  });

  it("never lends the last copy twice when two requests arrive together", async () => {
    const [a, b] = [await makeUser(db), await makeUser(db)];
    const book = await makeBook(db, 1);

    const results = await Promise.allSettled([
      borrowBook({ bookId: book.id, userId: a.id, actorId: a.id }),
      borrowBook({ bookId: book.id, userId: b.id, actorId: b.id }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await activeLoans(book.id)).toHaveLength(1);
  });

  it("refuses a book that has been deleted", async () => {
    const member = await makeUser(db);
    const book = await makeBook(db);
    await db.delete(books).where(eq(books.id, book.id));

    await expect(borrowBook({ bookId: book.id, userId: member.id, actorId: member.id })).rejects.toThrow(/no longer exists/);
  });
});

describe("returning", () => {
  it("closes the loan and frees the copy", async () => {
    const member = await makeUser(db);
    const book = await makeBook(db);
    const { loan } = await borrowBook({ bookId: book.id, userId: member.id, actorId: member.id });

    const result = await returnLoan({ loanId: loan.id, actorId: member.id, isStaff: false });

    expect(result.late).toBe(false);
    expect(await activeLoans(book.id)).toHaveLength(0);
    expect(await available(book.id)).toBe(1);
  });

  it("flags late returns", async () => {
    const member = await makeUser(db);
    const book = await makeBook(db);
    const loan = await makeLoan(db, book.id, member.id, -2);

    const result = await returnLoan({ loanId: loan.id, actorId: member.id, isStaff: false });

    expect(result.late).toBe(true);
  });

  it("refuses to return the same loan twice", async () => {
    const member = await makeUser(db);
    const loan = await makeLoan(db, (await makeBook(db)).id, member.id);
    await returnLoan({ loanId: loan.id, actorId: member.id, isStaff: false });

    await expect(returnLoan({ loanId: loan.id, actorId: member.id, isStaff: false })).rejects.toThrow(/already returned/);
  });

  it("lets members return only their own books, and staff return anyone's", async () => {
    const [owner, other] = [await makeUser(db), await makeUser(db)];
    const librarian = await makeUser(db, "librarian");
    const loan = await makeLoan(db, (await makeBook(db)).id, owner.id);

    await expect(returnLoan({ loanId: loan.id, actorId: other.id, isStaff: false })).rejects.toThrow(/your own books/);
    await expect(returnLoan({ loanId: loan.id, actorId: librarian.id, isStaff: true })).resolves.toBeTruthy();
  });
});

describe("renewing", () => {
  it(`extends the due date by ${LOAN_DAYS} days, at most ${MAX_RENEWALS} times`, async () => {
    const member = await makeUser(db);
    const book = await makeBook(db);
    const loan = await makeLoan(db, book.id, member.id, 5);

    const first = await renewLoan({ loanId: loan.id, actorId: member.id, isStaff: false });
    expect(first.dueAt.getTime() - loan.dueAt.getTime()).toBe(LOAN_DAYS * DAY);

    await renewLoan({ loanId: loan.id, actorId: member.id, isStaff: false });
    await expect(renewLoan({ loanId: loan.id, actorId: member.id, isStaff: false })).rejects.toThrow(/already been renewed/);

    const saved = await db.query.loans.findFirst({ where: eq(loans.id, loan.id) });
    expect(saved?.renewals).toBe(MAX_RENEWALS);
  });

  it("counts an overdue renewal from today, not from the old due date", async () => {
    const member = await makeUser(db);
    const loan = await makeLoan(db, (await makeBook(db)).id, member.id, -4);

    const before = Date.now();
    const { dueAt } = await renewLoan({ loanId: loan.id, actorId: member.id, isStaff: false });

    expect(dueAt.getTime()).toBeGreaterThanOrEqual(before + LOAN_DAYS * DAY);
  });

  it("is blocked while someone is waiting for the book", async () => {
    const [reader, waiter] = [await makeUser(db), await makeUser(db)];
    const book = await makeBook(db, 1);
    const loan = await makeLoan(db, book.id, reader.id);
    await placeHold({ bookId: book.id, userId: waiter.id });

    await expect(renewLoan({ loanId: loan.id, actorId: reader.id, isStaff: false })).rejects.toThrow(/Someone is waiting/);
  });

  it("lets members renew only their own loans", async () => {
    const [owner, other] = [await makeUser(db), await makeUser(db)];
    const loan = await makeLoan(db, (await makeBook(db)).id, owner.id);

    await expect(renewLoan({ loanId: loan.id, actorId: other.id, isStaff: false })).rejects.toThrow(/your own books/);
  });
});

describe("waitlist", () => {
  it("queues members in order and reports their position", async () => {
    const [reader, first, second] = [await makeUser(db), await makeUser(db), await makeUser(db)];
    const book = await makeBook(db, 1);
    await makeLoan(db, book.id, reader.id);

    expect((await placeHold({ bookId: book.id, userId: first.id })).position).toBe(1);
    expect((await placeHold({ bookId: book.id, userId: second.id })).position).toBe(2);
  });

  it("refuses duplicate holds and holds on a book the member already has", async () => {
    const [reader, waiter] = [await makeUser(db), await makeUser(db)];
    const book = await makeBook(db, 1);
    await makeLoan(db, book.id, reader.id);
    await placeHold({ bookId: book.id, userId: waiter.id });

    await expect(placeHold({ bookId: book.id, userId: waiter.id })).rejects.toThrow(/already on the waitlist/);
    await expect(placeHold({ bookId: book.id, userId: reader.id })).rejects.toThrow(/already have this book/);
  });

  it("reserves a returned copy for the first person in line, for 3 days", async () => {
    const [reader, first, second] = [await makeUser(db), await makeUser(db), await makeUser(db)];
    const book = await makeBook(db, 1);
    const loan = await makeLoan(db, book.id, reader.id);
    const h1 = await makeHold(db, book.id, first.id, 10);
    const h2 = await makeHold(db, book.id, second.id, 5);

    await returnLoan({ loanId: loan.id, actorId: reader.id, isStaff: false });

    const ready = await db.query.holds.findFirst({ where: eq(holds.id, h1.id) });
    expect(ready?.status).toBe("ready");
    const pickupDays = (ready!.expiresAt!.getTime() - ready!.readyAt!.getTime()) / DAY;
    expect(pickupDays).toBe(HOLD_PICKUP_DAYS);
    expect(await holdStatus(h2.id)).toBe("waiting");
    expect(await available(book.id)).toBe(0);
  });

  it("keeps a reserved copy for its holder only", async () => {
    const [reader, holder, stranger] = [await makeUser(db), await makeUser(db), await makeUser(db)];
    const book = await makeBook(db, 1);
    const loan = await makeLoan(db, book.id, reader.id);
    const hold = await makeHold(db, book.id, holder.id, 10);
    await returnLoan({ loanId: loan.id, actorId: reader.id, isStaff: false });

    await expect(borrowBook({ bookId: book.id, userId: stranger.id, actorId: stranger.id })).rejects.toThrow(/reserved for members on the waitlist/);

    await borrowBook({ bookId: book.id, userId: holder.id, actorId: holder.id });
    expect(await holdStatus(hold.id)).toBe("fulfilled");
  });

  it("expires reservations that were not picked up and moves to the next person", async () => {
    const [reader, first, second] = [await makeUser(db), await makeUser(db), await makeUser(db)];
    const book = await makeBook(db, 1);
    const loan = await makeLoan(db, book.id, reader.id);
    const h1 = await makeHold(db, book.id, first.id, 10);
    const h2 = await makeHold(db, book.id, second.id, 5);
    await returnLoan({ loanId: loan.id, actorId: reader.id, isStaff: false });

    // Pretend the pickup window ran out.
    await db.update(holds).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(holds.id, h1.id));
    await processHoldQueue(db, book.id);

    expect(await holdStatus(h1.id)).toBe("expired");
    expect(await holdStatus(h2.id)).toBe("ready");
  });

  it("passes a reservation on when its holder cancels", async () => {
    const [reader, first, second] = [await makeUser(db), await makeUser(db), await makeUser(db)];
    const book = await makeBook(db, 1);
    const loan = await makeLoan(db, book.id, reader.id);
    const h1 = await makeHold(db, book.id, first.id, 10);
    const h2 = await makeHold(db, book.id, second.id, 5);
    await returnLoan({ loanId: loan.id, actorId: reader.id, isStaff: false });

    await expect(cancelHold({ holdId: h1.id, actorId: second.id, isStaff: false })).rejects.toThrow(/your own holds/);
    await cancelHold({ holdId: h1.id, actorId: first.id, isStaff: false });

    expect(await holdStatus(h1.id)).toBe("cancelled");
    expect(await holdStatus(h2.id)).toBe("ready");
  });

  it("makes a hold ready at once when a copy is already free", async () => {
    const waiter = await makeUser(db);
    const book = await makeBook(db, 1);

    await placeHold({ bookId: book.id, userId: waiter.id });

    const hold = await db.query.holds.findFirst({ where: eq(holds.userId, waiter.id) });
    expect(hold?.status).toBe("ready");
  });
});

describe("search", () => {
  it("matches every word across title, author and tags, case-insensitively", async () => {
    const [book] = await db
      .insert(books)
      .values({ title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", tags: ["gender", "winter"] })
      .returning();
    await makeBook(db, 1, "Darkness Visible");

    const hits = await searchBooks({ q: "le guin WINTER darkness", sort: "relevance" });

    expect(hits.map((b) => b.id)).toEqual([book.id]);
  });

  it("filters to books that are available now", async () => {
    const member = await makeUser(db);
    const lent = await makeBook(db, 1, "Lent Out");
    const free = await makeBook(db, 1, "On The Shelf");
    await makeLoan(db, lent.id, member.id);

    const hits = await searchBooks({ q: "", availableOnly: true, sort: "title" });

    expect(hits.map((b) => b.id)).toEqual([free.id]);
  });
});
