import { asc, sql } from "drizzle-orm";
import type { DB } from "./client";
import {
  activity,
  books,
  copies,
  fines,
  holds,
  libraries,
  loans,
  memberships,
  reviews,
  users,
  type CopyCondition,
  type Role,
} from "./schema";
import { SEED_BOOKS } from "./seed-books";
import metadata from "./seed-metadata.json";
import { overdueFineCents } from "../money";
import { generateReminders, notify } from "../reminders";

type Meta = { isbn?: string; coverUrl?: string; pages?: number; publisher?: string };
const META = metadata as Record<string, Meta>;

export const DEMO_USERS: { email: string; name: string }[] = [
  { email: "admin@example.com", name: "Alex Morgan" },
  { email: "librarian@example.com", name: "Sam Rivera" },
  { email: "member@example.com", name: "Jordan Lee" },
  { email: "priya@example.com", name: "Priya Shah" },
  { email: "chen@example.com", name: "Chen Wei" },
  { email: "maria@example.com", name: "Maria Gonzalez" },
  { email: "tom@example.com", name: "Tom Becker" },
  { email: "noah@example.com", name: "Noah Patel" },
  { email: "aisha@example.com", name: "Aisha Khan" },
];

/** Which account each one-click demo login on the sign-in page uses. */
export const DEMO_LOGINS: Record<Role, string> = {
  admin: "admin@example.com",
  librarian: "librarian@example.com",
  member: "member@example.com",
};

const LIBRARIES = [
  {
    slug: "central",
    name: "Folio Central Library",
    code: "CEN",
    tagline: "The main branch, downtown",
    // Defaults: 14-day loans, 5 books, 2 renewals, $0.25/day, capped at $10, blocked from $5.
  },
  {
    slug: "riverside",
    name: "Riverside Community Library",
    code: "RIV",
    tagline: "A small neighbourhood branch with longer loans",
    loanDays: 21,
    maxLoans: 8,
    maxRenewals: 3,
    holdPickupDays: 5,
    finePerDayCents: 10,
    fineGraceDays: 2,
    maxFineCents: 500,
    lostItemFeeCents: 1500,
    blockAtCents: 1000,
  },
] satisfies (typeof libraries.$inferInsert)[];

const MEMBERSHIPS: [library: string, email: string, role: Role][] = [
  ["central", "admin@example.com", "admin"],
  ["central", "librarian@example.com", "librarian"],
  ["central", "member@example.com", "member"],
  ["central", "priya@example.com", "member"],
  ["central", "chen@example.com", "member"],
  ["central", "maria@example.com", "member"],
  ["central", "tom@example.com", "member"],
  ["riverside", "admin@example.com", "admin"],
  ["riverside", "noah@example.com", "librarian"],
  ["riverside", "librarian@example.com", "member"], // a librarian at Central is just a reader here
  ["riverside", "member@example.com", "member"],
  ["riverside", "maria@example.com", "member"],
  ["riverside", "aisha@example.com", "member"],
];

const RIVERSIDE_TITLES = [
  "The Hobbit",
  "Dune",
  "The Midnight Library",
  "Circe",
  "Klara and the Sun",
  "Atomic Habits",
  "Educated",
  "The Martian",
  "Pride and Prejudice",
  "And Then There Were None",
  "A Wizard of Earthsea",
  "Sapiens",
  "The Kite Runner",
  "Project Hail Mary",
  "The Road",
  "Mistborn: The Final Empire",
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

/**
 * Wipes all library data (libraries cascade to everything else) but keeps user accounts,
 * so people who signed in with SSO keep their login. They are re-added to the default
 * library automatically on their next visit.
 */
export async function resetLibraryData(db: DB) {
  await db.execute(sql`TRUNCATE libraries, memberships, books, copies, loans, holds, fines, notifications, reviews, activity RESTART IDENTITY CASCADE`);
}

export async function seed(db: DB, { reset = false }: { reset?: boolean } = {}) {
  if (reset) await resetLibraryData(db);

  const rand = rng(42);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const now = Date.now();

  // --- Libraries and people
  await db.insert(libraries).values(LIBRARIES).onConflictDoNothing();
  const libs = await db.select().from(libraries).orderBy(asc(libraries.createdAt));
  const lib = Object.fromEntries(LIBRARIES.map((l) => [l.slug, libs.find((x) => x.slug === l.slug)!])) as Record<"central" | "riverside", (typeof libs)[number]>;
  // Keep a stable order so Central is the default library.
  await db.update(libraries).set({ createdAt: new Date(now - 400 * DAY) }).where(sql`${libraries.slug} = 'central'`);
  await db.update(libraries).set({ createdAt: new Date(now - 300 * DAY) }).where(sql`${libraries.slug} = 'riverside'`);

  await db
    .insert(users)
    .values(DEMO_USERS.map((u) => ({ ...u, isDemo: true })))
    .onConflictDoNothing();
  const people = await db.query.users.findMany({
    where: (u, { inArray }) => inArray(u.email, DEMO_USERS.map((d) => d.email)),
  });
  const byEmail = new Map(people.map((u) => [u.email, u]));
  const user = (email: string) => byEmail.get(email)!;
  await db
    .insert(memberships)
    .values(
      MEMBERSHIPS.map(([slug, email, role], i) => ({
        libraryId: lib[slug as "central"].id,
        userId: user(email).id,
        role,
        // Staggered join dates so reports show members joining over time.
        createdAt: new Date(now - (role === "member" ? [210, 140, 75, 44, 21, 9][i % 6] : 300) * DAY),
      })),
    )
    .onConflictDoNothing();
  const membersOf = (slug: string) => MEMBERSHIPS.filter(([s, , r]) => s === slug && r === "member").map(([, e]) => user(e));

  // --- Catalogues and physical copies
  const conditionFor = (): CopyCondition => {
    const r = rand();
    return r < 0.12 ? "new" : r < 0.75 ? "good" : r < 0.93 ? "fair" : "poor";
  };
  async function stock(slug: "central" | "riverside", titles: string[], copiesFor: (title: string, original: number) => number, librarianEmail: string) {
    const library = lib[slug];
    const shelfCounter: Record<string, number> = {};
    const rows = SEED_BOOKS.filter((b) => titles.includes(b.title)).map((b) => {
      const m = META[b.title] ?? {};
      const code = GENRE_SHELF[b.genre] ?? "GN";
      shelfCounter[code] = (shelfCounter[code] ?? 0) + 1;
      return {
        libraryId: library.id,
        title: b.title,
        author: b.author,
        genre: b.genre,
        tags: b.tags,
        publishedYear: b.year,
        description: b.description,
        isbn: m.isbn ?? null,
        coverUrl: m.coverUrl ?? null,
        pages: m.pages ?? null,
        publisher: m.publisher ?? null,
        location: `${code}-${String(shelfCounter[code]).padStart(2, "0")}`,
        createdById: user(librarianEmail).id,
        createdAt: new Date(now - (slug === "central" ? 200 : 150) * DAY),
        updatedAt: new Date(now - (slug === "central" ? 200 : 150) * DAY),
      };
    });
    const inserted = await db.insert(books).values(rows).returning();
    let n = 0;
    const copyRows: (typeof copies.$inferInsert)[] = [];
    for (const b of inserted) {
      const original = SEED_BOOKS.find((s) => s.title === b.title)!.copies;
      for (let i = 0; i < copiesFor(b.title, original); i++) {
        n++;
        copyRows.push({ bookId: b.id, barcode: `${library.code}-${String(n).padStart(5, "0")}`, condition: conditionFor(), acquiredAt: b.createdAt });
      }
    }
    const insertedCopies = await db.insert(copies).values(copyRows).returning();
    const byTitle = new Map(inserted.map((b) => [b.title, b]));
    const copiesByBook = new Map<string, (typeof insertedCopies)[number][]>();
    for (const c of insertedCopies) copiesByBook.set(c.bookId, [...(copiesByBook.get(c.bookId) ?? []), c]);
    return { library, books: inserted, byTitle, copiesByBook, nextBarcode: n + 1 };
  }

  const central = await stock("central", SEED_BOOKS.map((b) => b.title), (_t, original) => original, "librarian@example.com");
  const riverside = await stock("riverside", RIVERSIDE_TITLES, (t) => (["The Hobbit", "Dune", "Atomic Habits"].includes(t) ? 2 : 1), "noah@example.com");

  // A worn-out copy that was withdrawn, and one that went missing (with a paid lost-item fee).
  const extraCopies = await db
    .insert(copies)
    .values([
      { bookId: central.byTitle.get("The Hobbit")!.id, barcode: `CEN-${String(central.nextBarcode).padStart(5, "0")}`, condition: "damaged", status: "withdrawn", note: "Water damage, spine split", acquiredAt: new Date(now - 380 * DAY) },
      { bookId: central.byTitle.get("The Great Gatsby")!.id, barcode: `CEN-${String(central.nextBarcode + 1).padStart(5, "0")}`, condition: "good", status: "lost", note: "Never returned", acquiredAt: new Date(now - 380 * DAY) },
    ])
    .returning();

  // --- Loans
  type LoanRow = typeof loans.$inferInsert;
  const allLoans: LoanRow[] = [];
  const cursor = new Map<string, number>(); // round-robin copy assignment for history

  function history(stocked: typeof central, members: typeof people, count: number, popular: string[], loanDays: number, issuer: string) {
    for (let i = 0; i < count; i++) {
      const book = rand() < 0.45 ? stocked.byTitle.get(pick(popular))! : pick(stocked.books);
      const bookCopies = stocked.copiesByBook.get(book.id)!;
      const idx = cursor.get(book.id) ?? 0;
      cursor.set(book.id, idx + 1);
      const borrowedAt = now - Math.floor(rand() * 120 + 25) * DAY;
      // Most readers bring books back in time; roughly one in six is late.
      const keptDays = rand() < 0.16 ? loanDays + 1 + Math.floor(rand() * 9) : 2 + Math.floor(rand() * (loanDays - 2));
      allLoans.push({
        libraryId: stocked.library.id,
        bookId: book.id,
        copyId: bookCopies[idx % bookCopies.length].id,
        userId: pick(members).id,
        issuedById: rand() < 0.5 ? user(issuer).id : null,
        borrowedAt: new Date(borrowedAt),
        dueAt: new Date(borrowedAt + loanDays * DAY),
        returnedAt: new Date(borrowedAt + keptDays * DAY),
      });
    }
  }
  history(central, membersOf("central"), 160, ["Dune", "Project Hail Mary", "Atomic Habits", "The Hobbit", "1984", "The Midnight Library", "Sapiens", "Circe"], 14, "librarian@example.com");
  history(riverside, membersOf("riverside"), 45, ["The Hobbit", "Dune", "Circe", "Atomic Habits"], 21, "noah@example.com");

  // Current loans: a realistic mix of on-time, due-soon and overdue. Each takes its own copy.
  const taken = new Map<string, number>();
  function current(stocked: typeof central, title: string, email: string, daysAgo: number, loanDays: number, issuer: string) {
    const book = stocked.byTitle.get(title)!;
    const bookCopies = stocked.copiesByBook.get(book.id)!;
    const i = taken.get(book.id) ?? 0;
    if (i >= bookCopies.length) throw new Error(`Seed: not enough copies of ${title}`);
    taken.set(book.id, i + 1);
    const borrowedAt = now - daysAgo * DAY;
    allLoans.push({
      libraryId: stocked.library.id,
      bookId: book.id,
      copyId: bookCopies[i].id,
      userId: user(email).id,
      issuedById: user(issuer).id,
      borrowedAt: new Date(borrowedAt),
      dueAt: new Date(borrowedAt + loanDays * DAY),
      returnedAt: null,
    });
  }
  const centralNow: [string, string, number][] = [
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
  for (const [t, e, d] of centralNow) current(central, t, e, d, 14, "librarian@example.com");
  const riversideNow: [string, string, number][] = [
    ["Klara and the Sun", "member@example.com", 20], // due tomorrow: "due soon" reminder
    ["Circe", "aisha@example.com", 5],
    ["Dune", "maria@example.com", 26], // 5 days late, 2 grace days
    ["Educated", "librarian@example.com", 8],
  ];
  for (const [t, e, d] of riversideNow) current(riverside, t, e, d, 21, "noah@example.com");

  // The lost Gatsby copy: a loan closed as lost.
  const lostLoanStart = now - 70 * DAY;
  allLoans.push({
    libraryId: central.library.id,
    bookId: central.byTitle.get("The Great Gatsby")!.id,
    copyId: extraCopies[1].id,
    userId: user("tom@example.com").id,
    issuedById: user("librarian@example.com").id,
    borrowedAt: new Date(lostLoanStart),
    dueAt: new Date(lostLoanStart + 14 * DAY),
    returnedAt: new Date(lostLoanStart + 40 * DAY),
  });

  const insertedLoans = await db.insert(loans).values(allLoans).returning();

  // --- Fines: charge late returns by each library's rules. Older ones are settled.
  const fineRows: (typeof fines.$inferInsert)[] = [];
  const libById = new Map(libs.map((l) => [l.id, l]));
  const staffOf = (libraryId: string) => user(libraryId === central.library.id ? "librarian@example.com" : "noah@example.com").id;
  for (const l of insertedLoans) {
    if (!l.returnedAt || l.copyId === extraCopies[1].id) continue;
    const amount = overdueFineCents(libById.get(l.libraryId)!, l.dueAt, l.returnedAt);
    if (!amount) continue;
    const ageDays = (now - l.returnedAt.getTime()) / DAY;
    // Anything older than two weeks has been settled; only recent late returns are still owed.
    const status = ageDays > 14 ? (rand() < 0.15 ? "waived" : "paid") : "open";
    fineRows.push({
      libraryId: l.libraryId,
      userId: l.userId,
      loanId: l.id,
      amountCents: amount,
      reason: "overdue",
      status,
      note: status === "waived" ? "First late return, waived as a courtesy" : null,
      createdAt: l.returnedAt,
      resolvedAt: status === "open" ? null : new Date(l.returnedAt.getTime() + 3 * DAY),
      resolvedById: status === "open" ? null : staffOf(l.libraryId),
    });
  }
  const lostLoan = insertedLoans.find((l) => l.copyId === extraCopies[1].id)!;
  fineRows.push(
    {
      libraryId: central.library.id,
      userId: user("tom@example.com").id,
      loanId: lostLoan.id,
      amountCents: lib.central.lostItemFeeCents,
      reason: "lost",
      status: "paid",
      note: "Replacement cost for CEN copy of The Great Gatsby",
      createdAt: lostLoan.returnedAt!,
      resolvedAt: new Date(lostLoan.returnedAt!.getTime() + 5 * DAY),
      resolvedById: user("librarian@example.com").id,
    },
    // Priya owes enough to be blocked at Central ($5 limit) until she pays.
    { libraryId: central.library.id, userId: user("priya@example.com").id, amountCents: 350, reason: "damaged", status: "open", note: "Coffee stain across several pages", createdAt: new Date(now - 6 * DAY) },
    { libraryId: central.library.id, userId: user("priya@example.com").id, amountCents: 225, reason: "overdue", status: "open", createdAt: new Date(now - 12 * DAY) },
    // Jordan has a small open fine: shown, but below the blocking limit.
    { libraryId: central.library.id, userId: user("member@example.com").id, amountCents: 150, reason: "overdue", status: "open", createdAt: new Date(now - 20 * DAY) },
  );
  await db.insert(fines).values(fineRows);

  // --- Waitlists
  const phm = central.byTitle.get("Project Hail Mary")!;
  const hobbitRiv = riverside.byTitle.get("The Hobbit")!;
  await db.insert(holds).values([
    { libraryId: central.library.id, bookId: phm.id, userId: user("maria@example.com").id, status: "waiting", createdAt: new Date(now - 3 * DAY) },
    { libraryId: central.library.id, bookId: phm.id, userId: user("member@example.com").id, status: "waiting", createdAt: new Date(now - 1 * DAY) },
  ]);
  // At Riverside a copy of The Hobbit is waiting on the reserve shelf for Jordan.
  const [ready] = await db
    .insert(holds)
    .values({
      libraryId: riverside.library.id,
      bookId: hobbitRiv.id,
      userId: user("member@example.com").id,
      status: "ready",
      readyAt: new Date(now - 1 * DAY),
      expiresAt: new Date(now + (lib.riverside.holdPickupDays - 1) * DAY),
      createdAt: new Date(now - 9 * DAY),
    })
    .returning();
  await db.insert(holds).values({ libraryId: riverside.library.id, bookId: hobbitRiv.id, userId: user("aisha@example.com").id, status: "waiting", createdAt: new Date(now - 2 * DAY) });
  // Keep the second Hobbit copy busy so the reserved one is the only one on the shelf.
  await db.insert(loans).values({
    libraryId: riverside.library.id,
    bookId: hobbitRiv.id,
    copyId: riverside.copiesByBook.get(hobbitRiv.id)![1].id,
    userId: user("maria@example.com").id,
    issuedById: user("noah@example.com").id,
    borrowedAt: new Date(now - 6 * DAY),
    dueAt: new Date(now + 15 * DAY),
  });
  await notify(db, {
    userId: ready.userId,
    libraryId: riverside.library.id,
    kind: "hold_ready",
    title: "“The Hobbit” is waiting for you",
    body: `A copy is on the reserve shelf at ${lib.riverside.name} until ${new Date(ready.expiresAt!).toDateString()}.`,
    href: `/books/${hobbitRiv.id}`,
    dedupeKey: `hold_ready:${ready.id}`,
  });

  // --- Reviews (Central only; Riverside is newer)
  const reviewRows: (typeof reviews.$inferInsert)[] = [];
  const seen = new Set<string>();
  const centralMembers = membersOf("central");
  for (let i = 0; i < 70; i++) {
    const book = rand() < 0.5 ? central.byTitle.get(pick(["Dune", "Project Hail Mary", "Atomic Habits", "The Hobbit", "Circe", "Sapiens"]))! : pick(central.books);
    const u = pick(centralMembers);
    const key = `${book.id}:${u.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    reviewRows.push({
      bookId: book.id,
      userId: u.id,
      rating: rand() < 0.15 ? 3 : rand() < 0.5 ? 4 : 5,
      body: pick(REVIEW_LINES),
      createdAt: new Date(now - Math.floor(rand() * 90) * DAY),
    });
  }
  await db.insert(reviews).values(reviewRows);

  // --- Activity log derived from the data above.
  const userName = new Map(people.map((u) => [u.id, u.name ?? u.email]));
  const bookTitle = new Map([...central.books, ...riverside.books].map((b) => [b.id, b.title]));
  const events: (typeof activity.$inferInsert)[] = [];
  for (const l of insertedLoans) {
    events.push({
      libraryId: l.libraryId,
      actorId: l.issuedById ?? l.userId,
      action: "loan.borrow",
      bookId: l.bookId,
      subjectUserId: l.userId,
      message: `${userName.get(l.userId)} borrowed “${bookTitle.get(l.bookId)}”`,
      createdAt: l.borrowedAt,
    });
    if (l.returnedAt) {
      const lost = l.id === lostLoan.id;
      events.push({
        libraryId: l.libraryId,
        actorId: lost ? user("librarian@example.com").id : l.userId,
        action: lost ? "copy.lost" : "loan.return",
        bookId: l.bookId,
        subjectUserId: l.userId,
        message: lost ? `Copy of “${bookTitle.get(l.bookId)}” borrowed by ${userName.get(l.userId)} marked lost` : `${userName.get(l.userId)} returned “${bookTitle.get(l.bookId)}”`,
        createdAt: l.returnedAt,
      });
    }
  }
  await db.insert(activity).values(events);

  // Reminders exactly as the daily job would create them.
  await generateReminders(db, new Date(now));

  return {
    libraries: libs.length,
    users: people.length,
    books: central.books.length + riverside.books.length,
    copies: [...central.copiesByBook.values(), ...riverside.copiesByBook.values()].flat().length + extraCopies.length,
    loans: insertedLoans.length + 1,
    fines: fineRows.length,
  };
}

export async function seedIfEmpty(db: DB) {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(books);
  if (count > 0) return null;
  return seed(db);
}
