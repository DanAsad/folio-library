import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "librarian", "member"]);
export const holdStatusEnum = pgEnum("hold_status", [
  "waiting", // in the queue
  "ready", // a copy is reserved for this member
  "fulfilled", // member borrowed the reserved copy
  "cancelled",
  "expired",
]);
export const copyConditionEnum = pgEnum("copy_condition", ["new", "good", "fair", "poor", "damaged"]);
export const copyStatusEnum = pgEnum("copy_status", [
  "active", // on the shelf or on loan
  "lost",
  "withdrawn", // removed from circulation (worn out, donated, ...)
]);
export const fineReasonEnum = pgEnum("fine_reason", ["overdue", "lost", "damaged"]);
export const fineStatusEnum = pgEnum("fine_status", ["open", "paid", "waived"]);
export const notificationKindEnum = pgEnum("notification_kind", ["due_soon", "overdue", "hold_ready", "fine"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

/**
 * A library (tenant). Every catalogue, loan, hold, fine and log entry belongs to one,
 * and each library sets its own circulation rules.
 */
export const libraries = pgTable("libraries", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** Short code used as the barcode prefix, e.g. "CEN" -> CEN-00042. */
  code: text("code").notNull().unique(),
  tagline: text("tagline"),
  loanDays: integer("loan_days").notNull().default(14),
  maxLoans: integer("max_loans").notNull().default(5),
  maxRenewals: integer("max_renewals").notNull().default(2),
  holdPickupDays: integer("hold_pickup_days").notNull().default(3),
  /** Fines are stored in cents to avoid floating-point money. 0 turns fines off. */
  finePerDayCents: integer("fine_per_day_cents").notNull().default(25),
  fineGraceDays: integer("fine_grace_days").notNull().default(0),
  maxFineCents: integer("max_fine_cents").notNull().default(1000),
  lostItemFeeCents: integer("lost_item_fee_cents").notNull().default(2000),
  /** Members can't borrow while they owe at least this much. 0 = never block. */
  blockAtCents: integer("block_at_cents").notNull().default(500),
  currency: text("currency").notNull().default("USD"),
  ...timestamps,
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  isDemo: boolean("is_demo").notNull().default(false),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  ...timestamps,
});

/** A person's role in one library. The same account can be a librarian here and a member there. */
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    libraryId: uuid("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("member"),
    ...timestamps,
  },
  (t) => [uniqueIndex("memberships_library_user_idx").on(t.libraryId, t.userId), index("memberships_user_idx").on(t.userId)],
);

export const books = pgTable(
  "books",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    libraryId: uuid("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    author: text("author").notNull(),
    isbn: text("isbn"),
    genre: text("genre"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    publishedYear: integer("published_year"),
    publisher: text("publisher"),
    pages: integer("pages"),
    language: text("language").notNull().default("English"),
    description: text("description"),
    coverUrl: text("cover_url"),
    /** Shelf / call number for the title. */
    location: text("location"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("books_library_idx").on(t.libraryId),
    index("books_title_idx").on(t.title),
    index("books_author_idx").on(t.author),
  ],
);

/** A physical item. Loans are made against a specific copy, identified by its barcode. */
export const copies = pgTable(
  "copies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    barcode: text("barcode").notNull().unique(),
    condition: copyConditionEnum("condition").notNull().default("good"),
    status: copyStatusEnum("status").notNull().default("active"),
    note: text("note"),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [index("copies_book_idx").on(t.bookId)],
);

export const loans = pgTable(
  "loans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    libraryId: uuid("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    copyId: uuid("copy_id")
      .notNull()
      .references(() => copies.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    issuedById: uuid("issued_by_id").references(() => users.id, { onDelete: "set null" }),
    borrowedAt: timestamp("borrowed_at", { withTimezone: true }).notNull().defaultNow(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    renewals: integer("renewals").notNull().default(0),
  },
  (t) => [
    index("loans_library_idx").on(t.libraryId),
    index("loans_book_idx").on(t.bookId),
    index("loans_copy_idx").on(t.copyId),
    index("loans_user_idx").on(t.userId),
    index("loans_active_idx").on(t.returnedAt),
  ],
);

export const holds = pgTable(
  "holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    libraryId: uuid("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: holdStatusEnum("status").notNull().default("waiting"),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("holds_book_idx").on(t.bookId, t.status), index("holds_library_idx").on(t.libraryId)],
);

export const fines = pgTable(
  "fines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    libraryId: uuid("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    loanId: uuid("loan_id").references(() => loans.id, { onDelete: "set null" }),
    amountCents: integer("amount_cents").notNull(),
    reason: fineReasonEnum("reason").notNull(),
    status: fineStatusEnum("status").notNull().default("open"),
    note: text("note"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedById: uuid("resolved_by_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("fines_library_status_idx").on(t.libraryId, t.status), index("fines_user_idx").on(t.userId)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    libraryId: uuid("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    kind: notificationKindEnum("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href"),
    /** Stops the daily job from sending the same reminder twice. */
    dedupeKey: text("dedupe_key").notNull().unique(),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    body: text("body"),
    ...timestamps,
  },
  (t) => [uniqueIndex("reviews_book_user_idx").on(t.bookId, t.userId)],
);

export const activity = pgTable(
  "activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    libraryId: uuid("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    bookId: uuid("book_id").references(() => books.id, { onDelete: "set null" }),
    subjectUserId: uuid("subject_user_id").references(() => users.id, { onDelete: "set null" }),
    message: text("message").notNull(),
    ...timestamps,
  },
  (t) => [index("activity_created_idx").on(t.createdAt), index("activity_library_idx").on(t.libraryId)],
);

export const librariesRelations = relations(libraries, ({ many }) => ({
  memberships: many(memberships),
  books: many(books),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  loans: many(loans),
  holds: many(holds),
  reviews: many(reviews),
  fines: many(fines),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  library: one(libraries, { fields: [memberships.libraryId], references: [libraries.id] }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));

export const booksRelations = relations(books, ({ one, many }) => ({
  library: one(libraries, { fields: [books.libraryId], references: [libraries.id] }),
  copies: many(copies),
  loans: many(loans),
  holds: many(holds),
  reviews: many(reviews),
}));

export const copiesRelations = relations(copies, ({ one, many }) => ({
  book: one(books, { fields: [copies.bookId], references: [books.id] }),
  loans: many(loans),
}));

export const loansRelations = relations(loans, ({ one }) => ({
  book: one(books, { fields: [loans.bookId], references: [books.id] }),
  copy: one(copies, { fields: [loans.copyId], references: [copies.id] }),
  user: one(users, { fields: [loans.userId], references: [users.id] }),
}));

export const holdsRelations = relations(holds, ({ one }) => ({
  book: one(books, { fields: [holds.bookId], references: [books.id] }),
  user: one(users, { fields: [holds.userId], references: [users.id] }),
}));

export const finesRelations = relations(fines, ({ one }) => ({
  user: one(users, { fields: [fines.userId], references: [users.id] }),
  loan: one(loans, { fields: [fines.loanId], references: [loans.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  book: one(books, { fields: [reviews.bookId], references: [books.id] }),
  user: one(users, { fields: [reviews.userId], references: [users.id] }),
}));

export const activityRelations = relations(activity, ({ one }) => ({
  actor: one(users, { fields: [activity.actorId], references: [users.id] }),
  book: one(books, { fields: [activity.bookId], references: [books.id] }),
}));

export type Library = typeof libraries.$inferSelect;
export type User = typeof users.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type Book = typeof books.$inferSelect;
export type NewBook = typeof books.$inferInsert;
export type Copy = typeof copies.$inferSelect;
export type CopyCondition = (typeof copyConditionEnum.enumValues)[number];
export type Loan = typeof loans.$inferSelect;
export type Hold = typeof holds.$inferSelect;
export type Fine = typeof fines.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Review = typeof reviews.$inferSelect;
