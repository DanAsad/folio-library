import { sql } from "drizzle-orm";
import type { DB } from "./client";
import { activity, books, holds, loans, reviews, users, type Role } from "./schema";
import { SEED_BOOKS } from "./seed-books";
import metadata from "./seed-metadata.json";

type Meta = { isbn?: string; coverUrl?: string; pages?: number; publisher?: string };
const META = metadata as Record<string, Meta>;

export const DEMO_USERS: { email: string; name: string; role: Role }[] = [
  { email: "admin@example.com", name: "Alex Morgan", role: "admin" },
  { email: "librarian@example.com", name: "Sam Rivera", role: "librarian" },
  { email: "member@example.com", name: "Jordan Lee", role: "member" },
  { email: "priya@example.com", name: "Priya Shah", role: "member" },
  { email: "chen@example.com", name: "Chen Wei", role: "member" },
  { email: "maria@example.com", name: "Maria Gonzalez", role: "member" },
  { email: "tom@example.com", name: "Tom Becker", role: "member" },
];

const GENRE_SHELF: Record<string, string> = {
  Classics: "CL",
  Dystopian: "DY",
  "Literary Fiction": "LF",
  "Science Fiction": "SF",
  Fantasy: "FA",
  Mystery: "MY",
  Thriller: "TH",
  History: "HI",
  Science: "SC",
  Psychology: "PS",
  Memoir: "ME",
  "Self-Help": "SH",
  Technology: "TE",
  Design: "DE",
};

const REVIEW_LINES = [
  "Couldn't put it down. Finished it in a weekend.",
  "Slow start, but the last third is fantastic.",
  "A classic for a reason. Glad I finally read it.",
  "Beautifully written and surprisingly moving.",
  "Great book-club pick, lots to talk about.",
  "Not quite for me, but I can see why people love it.",
  "Smart, thought-provoking and very readable.",
  "Re-read it this year and it holds up.",
  "The ending stayed with me for days.",
  "Practical and clear. I took a lot of notes.",
];

// Small deterministic PRNG so every fresh database looks the same.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 24 * 60 * 60 * 1000;

export async function seed(db: DB, { reset = false }: { reset?: boolean } = {}) {
  if (reset) {
    await db.execute(sql`TRUNCATE activity, reviews, holds, loans, books, users RESTART IDENTITY CASCADE`);
  }

  const rand = rng(42);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const now = Date.now();

  await db
    .insert(users)
    .values(DEMO_USERS.map((u) => ({ ...u, isDemo: true })))
    .onConflictDoNothing();
  const insertedUsers = await db.query.users.findMany({
    where: (u, { inArray }) => inArray(u.email, DEMO_USERS.map((d) => d.email)),
  });
  const byEmail = new Map(insertedUsers.map((u) => [u.email, u]));
  const librarian = byEmail.get("librarian@example.com")!;
  const members = insertedUsers.filter((u) => u.role === "member");
  const jordan = byEmail.get("member@example.com")!;

  const shelfCounter: Record<string, number> = {};
  const insertedBooks = await db
    .insert(books)
    .values(
      SEED_BOOKS.map((b) => {
        const m = META[b.title] ?? {};
        const code = GENRE_SHELF[b.genre] ?? "GN";
        shelfCounter[code] = (shelfCounter[code] ?? 0) + 1;
        return {
          title: b.title,
          author: b.author,
          genre: b.genre,
          tags: b.tags,
          publishedYear: b.year,
          description: b.description,
          totalCopies: b.copies,
          isbn: m.isbn ?? null,
          coverUrl: m.coverUrl ?? null,
          pages: m.pages ?? null,
          publisher: m.publisher ?? null,
          location: `${code}-${String(shelfCounter[code]).padStart(2, "0")}`,
          createdById: librarian.id,
          createdAt: new Date(now - 200 * DAY),
          updatedAt: new Date(now - 200 * DAY),
        };
      }),
    )
    .returning();
  const byTitle = new Map(insertedBooks.map((b) => [b.title, b]));

  // --- Loan history (returned) over the last ~4 months, weighted to popular books.
  const popular = ["Dune", "Project Hail Mary", "Atomic Habits", "The Hobbit", "1984", "The Midnight Library", "Sapiens", "Circe"];
  const history: (typeof loans.$inferInsert)[] = [];
  for (let i = 0; i < 160; i++) {
    const book = rand() < 0.45 ? byTitle.get(pick(popular))! : pick(insertedBooks);
    const user = pick(members);
    const borrowedAt = now - Math.floor(rand() * 120 + 16) * DAY;
    const keptDays = 3 + Math.floor(rand() * 18);
    history.push({
      bookId: book.id,
      userId: user.id,
      issuedById: rand() < 0.5 ? librarian.id : null,
      borrowedAt: new Date(borrowedAt),
      dueAt: new Date(borrowedAt + 14 * DAY),
      returnedAt: new Date(borrowedAt + keptDays * DAY),
    });
  }

  // --- Current loans: a realistic mix of on-time, due-soon and overdue.
  const active: [string, string, number][] = [
    // [book, member email, days since borrowed]
    ["Project Hail Mary", "priya@example.com", 4],
    ["Project Hail Mary", "chen@example.com", 9],
    ["Dune", "maria@example.com", 3],
    ["Dune", "tom@example.com", 12],
    ["The Midnight Library", "member@example.com", 9],
    ["Neuromancer", "member@example.com", 17],
    ["Atomic Habits", "priya@example.com", 20],
    ["Circe", "tom@example.com", 6],
    ["Sapiens", "chen@example.com", 1],
    ["The Hobbit", "maria@example.com", 16],
    ["Gone Girl", "priya@example.com", 2],
  ];
  const current = active.map(([title, email, ago]) => {
    const borrowedAt = now - ago * DAY;
    return {
      bookId: byTitle.get(title)!.id,
      userId: byEmail.get(email)!.id,
      issuedById: librarian.id,
      borrowedAt: new Date(borrowedAt),
      dueAt: new Date(borrowedAt + 14 * DAY),
      returnedAt: null,
    };
  });

  await db.insert(loans).values([...history, ...current]);

  // --- Waitlist: Project Hail Mary is fully checked out with a queue.
  const phm = byTitle.get("Project Hail Mary")!;
  await db.insert(holds).values([
    { bookId: phm.id, userId: byEmail.get("maria@example.com")!.id, status: "waiting", createdAt: new Date(now - 3 * DAY) },
    { bookId: phm.id, userId: jordan.id, status: "waiting", createdAt: new Date(now - 1 * DAY) },
  ]);

  // --- Reviews
  const reviewRows: (typeof reviews.$inferInsert)[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < 70; i++) {
    const book = rand() < 0.5 ? byTitle.get(pick(popular))! : pick(insertedBooks);
    const user = pick(members);
    const key = `${book.id}:${user.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    reviewRows.push({
      bookId: book.id,
      userId: user.id,
      rating: rand() < 0.15 ? 3 : rand() < 0.5 ? 4 : 5,
      body: pick(REVIEW_LINES),
      createdAt: new Date(now - Math.floor(rand() * 90) * DAY),
    });
  }
  await db.insert(reviews).values(reviewRows);

  // --- Activity log derived from the loans above (most recent first matters only for display).
  const userName = new Map(insertedUsers.map((u) => [u.id, u.name ?? u.email]));
  const bookTitle = new Map(insertedBooks.map((b) => [b.id, b.title]));
  const events: (typeof activity.$inferInsert)[] = [];
  for (const l of [...history, ...current]) {
    events.push({
      actorId: l.issuedById ?? l.userId,
      action: "loan.borrow",
      bookId: l.bookId,
      subjectUserId: l.userId,
      message: `${userName.get(l.userId)} borrowed “${bookTitle.get(l.bookId)}”`,
      createdAt: l.borrowedAt,
    });
    if (l.returnedAt) {
      events.push({
        actorId: l.userId,
        action: "loan.return",
        bookId: l.bookId,
        subjectUserId: l.userId,
        message: `${userName.get(l.userId)} returned “${bookTitle.get(l.bookId)}”`,
        createdAt: l.returnedAt,
      });
    }
  }
  await db.insert(activity).values(events);

  return { users: insertedUsers.length, books: insertedBooks.length, loans: history.length + current.length };
}

export async function seedIfEmpty(db: DB) {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(books);
  if (count > 0) return null;
  return seed(db);
}
