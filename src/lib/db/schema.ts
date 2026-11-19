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

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  image: text("image"),
  role: roleEnum("role").notNull().default("member"),
  isDemo: boolean("is_demo").notNull().default(false),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  ...timestamps,
});

export const books = pgTable(
  "books",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
    totalCopies: integer("total_copies").notNull().default(1),
    location: text("location"),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("books_title_idx").on(t.title), index("books_author_idx").on(t.author)],
);

export const loans = pgTable(
  "loans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookId: uuid("book_id")
      .notNull()
      .references(() => books.id, { onDelete: "cascade" }),
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
    index("loans_book_idx").on(t.bookId),
    index("loans_user_idx").on(t.userId),
    index("loans_active_idx").on(t.returnedAt),
  ],
);

export const holds = pgTable(
  "holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
  (t) => [index("holds_book_idx").on(t.bookId, t.status)],
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
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    bookId: uuid("book_id").references(() => books.id, { onDelete: "set null" }),
    subjectUserId: uuid("subject_user_id").references(() => users.id, { onDelete: "set null" }),
    message: text("message").notNull(),
    ...timestamps,
  },
  (t) => [index("activity_created_idx").on(t.createdAt)],
);

export const usersRelations = relations(users, ({ many }) => ({
  loans: many(loans),
  holds: many(holds),
  reviews: many(reviews),
}));

export const booksRelations = relations(books, ({ many }) => ({
  loans: many(loans),
  holds: many(holds),
  reviews: many(reviews),
}));

export const loansRelations = relations(loans, ({ one }) => ({
  book: one(books, { fields: [loans.bookId], references: [books.id] }),
  user: one(users, { fields: [loans.userId], references: [users.id] }),
}));

export const holdsRelations = relations(holds, ({ one }) => ({
  book: one(books, { fields: [holds.bookId], references: [books.id] }),
  user: one(users, { fields: [holds.userId], references: [users.id] }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  book: one(books, { fields: [reviews.bookId], references: [books.id] }),
  user: one(users, { fields: [reviews.userId], references: [users.id] }),
}));

export const activityRelations = relations(activity, ({ one }) => ({
  actor: one(users, { fields: [activity.actorId], references: [users.id] }),
  book: one(books, { fields: [activity.bookId], references: [books.id] }),
}));

export type User = typeof users.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type Book = typeof books.$inferSelect;
export type NewBook = typeof books.$inferInsert;
export type Loan = typeof loans.$inferSelect;
export type Hold = typeof holds.$inferSelect;
export type Review = typeof reviews.$inferSelect;
