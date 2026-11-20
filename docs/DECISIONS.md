# Design decisions and trade-offs

Short notes on the choices behind Folio, what they cost, and what I'd do next. The aim was a small app that behaves like real software for real libraries, not a demo that only works on the happy path.

## Product scope

**Physical copies, not a copy count.** A library lends *items*, not titles. Each copy has a barcode, a condition and a status, and a loan points at the exact copy. That is what makes desk check-in by scanning, "who has copy CEN-00042?", lost-item handling and condition tracking possible. A plain `total_copies` number can't answer any of those.

**Several libraries in one app.** Software like this is usually sold to many organisations, so I modelled tenancy early: every catalogue, loan, hold, fine, notification and log entry carries a `library_id`, and roles live on a `memberships` table rather than on the user. The same person can be a librarian at one branch and a member at another. Each library sets its own rules (loan period, limits, fines, currency) because those genuinely differ between real libraries.

**Fines in integer cents, charged at check-in.** Money is never a float. Fines are created when the book comes back late, so a fine is a fact rather than a number recomputed on every page view. While a loan is still out, the app shows the fee *so far* as an estimate. Days late are counted in calendar days, so returning a book later on its due date isn't late, which matches how a date stamp works.

**Borrowing terminology.** The brief says "check in = borrow, check out = return", which is the reverse of library usage. Rather than pick a side, members see **Borrow / Return** and staff see **Check out to member / Check in**.

## Architecture

**Next.js App Router with Server Components and Server Actions.** Pages read the database directly on the server and mutations are server actions, so there's no separate REST layer to keep in sync and no client-side data fetching to get wrong. The trade-off is a tighter coupling to Next.js, which I accepted for a small team and fast iteration.

**All business rules in one module (`src/lib/library.ts`).** Pages and actions never write loans or fines themselves; they call functions like `borrowBook`, `returnLoan` or `markLoanLost`. That keeps the rules in one place, makes them testable without a browser, and means the UI can't bypass them.

**Correctness under concurrency.** Borrowing, returning and holds run in a transaction that locks the book row (`SELECT … FOR UPDATE`), so two people can't take the last copy at once. The holds queue is re-evaluated inside the same transaction whenever a copy frees up.

**Tenant isolation is enforced on the server, twice.** The current library comes from the session (a cookie, validated against the user's memberships on every request), and every domain function takes a `libraryId` and checks that the book, loan, hold or fine belongs to it. A book from another library is simply "not found". Tests cover this.

**Permissions are data.** `PERMISSIONS` maps actions to roles, and every action, API route and page checks `can(role, permission)` against the role in the current library. Hiding a button is never the only line of defence.

**Postgres everywhere, with zero setup locally.** Production uses Neon. Locally, and in tests, the same schema and SQL run on PGlite (Postgres compiled to WebAssembly), so `npm install && npm run dev` works with no database to install, and tests exercise real SQL, transactions and locks instead of mocks.

**Migrations that are safe on live data.** Moving from one library to many added required columns to tables that already had rows in production. The generated migration would have failed, so I edited it: add the columns as nullable, create the first library from the existing data, turn each counted copy into a barcoded copy, attach every loan to a distinct copy, then make the columns required. A test runs the real migration files over data in the old format to prove it.

**Background work without a job server.** A single daily Vercel Cron route creates reminders, expires uncollected reservations and resets the demo. Reminders carry a unique dedupe key, so running the job twice (or retrying after a failure) never double-notifies. Holds also self-heal lazily: any page that touches a book processes its queue first.

**Four languages without a framework.** Translations are plain typed dictionaries (`src/i18n/messages`), with English as the source: TypeScript refuses to build if French, Spanish or Italian miss a key, and a test checks every message keeps the same placeholders. A ~150-line translator adds plurals (`Intl.PluralRules`) and locale-aware dates, money and relative times through `Intl`, so there's no i18n library to learn. The language lives in a cookie (falling back to `Accept-Language`) rather than in the URL, because the app sits behind a login and doesn't need translated, crawlable paths. Anything stored in the database for people to read later (notifications, the activity log) is saved as a message key plus parameters, so the same row renders in each reader's language; an English copy is kept for emails and old rows. Domain errors carry a key too, so the rules layer stays language-free and the action layer translates.

**A public catalogue that can't leak.** `/catalog` lets anyone browse without signing in. Rather than reuse the signed-in book queries and hide fields in the UI, it has its own small read-only module that only selects catalogue data and counts, and never writes (the signed-in pages process the waitlist on view). A test asserts no member name, email or id appears in what it returns.

**Optional email.** Notifications always exist in the app. Email is a thin adapter (Resend's HTTP API via `fetch`, no SDK) that only runs when configured, never emails demo or reserved-domain addresses, and sends after the response with `after()` so the desk never waits on it.

## AI

**Free and keyless by design.** The AI uses an open model through Pollinations' anonymous tier, so the demo costs nothing and isn't tied to anyone's account. The price is a shared rate limit (about one reply every 45 seconds) and 10–30 second replies, so every AI feature has a non-AI fallback, a visible "busy" state, and validated output (Zod schemas, links to books that don't exist are dropped). Swapping in a paid or local model is one environment variable.

**Privacy.** Only catalogue data, book titles and the reader's question go to the model, never names or emails. The prompt includes the current library's rules, so answers about loans and fines are correct for that library.

## Quality

- 60 Vitest tests over the domain rules, tenancy, fines, the public catalogue, translations, reminders, reports, seed and migrations, running against a real in-memory Postgres in about 3 seconds.
- GitHub Actions runs lint, typecheck, a production build, and the tests twice: on the embedded database and on a real Postgres server through the production driver. The second run exists because a raw SQL fragment with a JavaScript `Date` worked on the embedded database but not on Neon; this catches that class of bug before it ships.
- The deploy guard fails a Vercel build without `DATABASE_URL`, instead of shipping a site that crashes on first load.

## What I'd do next

- **Online payments** (e.g. Stripe Checkout) so members can pay fines themselves; today staff record payments at the desk.
- **Branch-level inventory** inside a library (copies at different branches, transfers, holds picked up at a chosen branch).
- **Opening hours and closed days** so due dates and fines skip days the library is closed.
- **Invitations** with a signed link, instead of pre-adding people by email.
- **Row-level security** in Postgres as a second, database-level tenant boundary.
- **End-to-end tests** (Playwright) for the main journeys, alongside the domain tests.
- **Accessibility audit** with a screen reader, beyond the Radix defaults.
