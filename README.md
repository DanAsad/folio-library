# Folio · Mini Library Management System

[![CI](https://github.com/DanAsad/folio-library/actions/workflows/ci.yml/badge.svg)](https://github.com/DanAsad/folio-library/actions/workflows/ci.yml)

A small but complete library system: catalogue books and their physical copies, lend and return them, run waitlists, charge and settle fines, report on circulation, and help readers find their next book with an AI librarian. It runs several libraries side by side, each with its own catalogue, members, roles and rules.

**Live demo:** https://folio-library-zeta.vercel.app · **Source:** https://github.com/DanAsad/folio-library · **Design decisions:** [docs/DECISIONS.md](docs/DECISIONS.md)

Sign in with GitHub, or pick a one-click demo account on the login page:

| Demo account | Role | What to try |
| --- | --- | --- |
| Jordan Lee | Member at both libraries | At Central: an overdue book blocks borrowing, and there's a small unpaid fine. Open the 🔔: at Riverside a reserved copy of *The Hobbit* is waiting, and clicking the notice switches library. Try smart search and the AI librarian. |
| Sam Rivera | Librarian at Central, member at Riverside | Check books in at the desk by scanning or typing a barcode (e.g. `CEN-00021`), lend a specific copy, mark a copy lost, record fine payments, view reports. Switch to Riverside to see the same person as an ordinary member. |
| Alex Morgan | Admin at both | Everything above, plus people and roles, each library's lending and fine rules, opening a new library, and resetting the demo. |

The demo data **resets every night at 04:00 UTC** (admins can also reset it from *Library settings*), so feel free to change things.

**Stack:** Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind CSS 4 + shadcn/ui · PostgreSQL (Drizzle ORM; Neon in production, embedded PGlite locally) · Auth.js (Google / GitHub SSO + demo accounts) · free open-source AI (GPT-OSS 20B through Pollinations; no account or API key) · Open Library API · Vitest · GitHub Actions · Vercel (hosting + cron).

---

## Quick start (no accounts needed)

Requirements: **Node.js 20.9+**.

```bash
npm install
npm run dev
```

Open http://localhost:3000 and pick a demo account: **Member**, **Librarian** or **Admin**.

That's it. With no `DATABASE_URL`, the app starts an embedded Postgres (PGlite) in `./.data`, creates the tables and seeds two sample libraries: 56 titles and 90 barcoded copies with real covers, 9 people, about 220 loans (some overdue), fines, waitlists, reviews and notifications.

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build && npm start` | Production build |
| `npm test` | Run the automated tests (no database or accounts needed) |
| `npm run lint` / `npm run typecheck` | Static checks |
| `npm run db:reset` | Wipe and re-seed the database (stop the dev server first when using the embedded DB) |
| `npm run db:setup` | Apply migrations and seed if empty (used for hosted Postgres) |
| `npm run db:generate` | Generate a new SQL migration after changing `src/lib/db/schema.ts` |

To enable optional features, copy `.env.example` to `.env` and fill in what you need (see [Configuration](#configuration)).

---

## Features

### Core
- **Book management.** Add, edit and delete books with title, author, ISBN, genre, tags, year, publisher, pages, language, description, cover and shelf location. Validation runs on the server, and a book can't be deleted while copies are on loan.
- **Physical copies.** Each title has individual copies with their own barcode (`CEN-00042`), condition (new → damaged) and status (in circulation, lost, withdrawn). Staff add copies with fresh barcodes, update their condition, withdraw worn ones, and see where every copy is.
- **Check-out / check-in.** Members borrow and return their own books. Librarians check a book (or a specific copy, by barcode) out to any member, and check books in at the desk by scanning or typing the copy's barcode, recording its condition as it comes back. Loans can be renewed (unless someone is waiting) and marked lost.
  > The brief describes "checked in (borrowed)" and "checked out (returned)", which reverses the usual library terms. The app avoids the confusion with plain **Borrow / Return** buttons for members, and **Check out to member / Check in** for librarians.
- **Search.** Instant search across title, author, ISBN, genre, tags, publisher, description and copy barcodes, or limit it to one field. Every word must match, and title matches rank first. Filters cover genre and "available now". Sort by best match, title, author, popularity, rating, year or recently added. Switch between a cover grid and a table.

### Several libraries, each with its own rules
- A **library switcher** in the sidebar. Everything (catalogue, copies, loans, holds, fines, members, reports and the activity log) belongs to one library, and nothing leaks between them.
- **Roles are per library**: the same person can be a librarian at one branch and a member at another.
- **Rules per library**, set by its admins: loan period, books at a time, renewals, hold pickup window, daily fine, grace days, fine cap, lost-item fee, the balance at which borrowing pauses, and currency.
- Admins can **open a new library** with its own barcode prefix, and **add people** by email (they get in by signing in with that email through SSO).

### Fines
- **Late fees are charged automatically** at check-in: per calendar day late, after the grace period, capped per loan. A lost copy charges the lost-item fee. Staff can add a fee for damage.
- Members see what they owe and why. Once the balance reaches the library's limit, borrowing pauses until it's settled.
- Staff record **payments or waivers** at the desk. All amounts are stored as integer cents.

### Notifications and reminders
- A **🔔 notification centre** for due-soon reminders (2 days before), overdue reminders (first day, then weekly), reserved copies ready to collect, and fines.
- A **daily job** (Vercel Cron, `vercel.json`) creates the reminders, expires reservations nobody collected, and on the demo resets the data. Reminders are deduplicated, so the job is safe to re-run.
- **Email is optional**: set `RESEND_API_KEY` and `EMAIL_FROM` and the same notices are emailed too. Demo accounts never receive email.

### Reports
- Per-library **reports** for the last 30 days, 90 days or 12 months: loans, borrowers, late-return rate, average loan length, new members, fines charged / collected / waived / outstanding, circulation and fines charts, genres, most-borrowed titles, most active readers, and the condition of the collection.
- **CSV exports**: a summary by week or month, every loan, and every fine.

### Authentication and roles
- **SSO** with Google and GitHub through Auth.js. A new account joins the main library as a member; `ADMIN_EMAILS` makes chosen emails admins.
- **One-click demo accounts** for each role, so reviewers can try everything without an SSO account. Turn them off with `DEMO_MODE=false`.
- **Role-based permissions** (`src/lib/permissions.ts`), checked against your role *in the current library* in every server action, API route and protected page, not just hidden in the UI:

| | Member | Librarian | Admin |
| --- | :---: | :---: | :---: |
| Browse, search, borrow, return, renew, waitlist, review | ✓ | ✓ | ✓ |
| Add / edit / delete / import / export books, manage copies | | ✓ | ✓ |
| Circulation desk: check out / in for anyone, mark lost | | ✓ | ✓ |
| Record payments, waive or add fines | | ✓ | ✓ |
| Dashboard analytics, reports, activity log, member list | | ✓ | ✓ |
| Add people, change roles | | | ✓ |
| Library rules, open a new library, reset demo data | | | ✓ |

### AI features (free, no account)
The AI runs on a free, open-source model (GPT-OSS 20B) through [Pollinations](https://pollinations.ai)' anonymous tier. There's **no sign-up, no API key and no cost**, and it isn't tied to anyone's account. It works out of the box.

1. **Smart search.** Describe what you want ("short sci-fi from the 90s I can borrow today"), and the AI turns it into structured filters (genre, year range, availability, keywords, sort). The app shows how it read the request.
2. **Auto-cataloguing.** Type or scan an ISBN and click *Auto-fill*. Bibliographic facts come from Open Library, then the AI writes a spoiler-free blurb and picks a genre and tags that match the existing catalogue.
3. **Ask the Librarian.** A streaming chat assistant that knows the current library's catalogue, live availability, its rules and fines, and the reader's history. It recommends only books the library owns, and every catalogue title it mentions links to the book's page.
4. **Picked for you.** Instant picks on the member dashboard from the reader's favourite genres. *Personalise with AI* replaces them with AI picks, each with a one-line reason tied to the reader's history.

**Limits of the free tier, and how the app handles them:**
- It allows about **one AI reply every 45 seconds** per server, shared by all visitors. If the AI is busy, the app says so with a countdown and falls back to plain keyword search, heuristic picks or Open Library data. Nothing breaks.
- Replies take roughly **10–30 seconds**, and the app shows a "thinking" status meanwhile.
- The free service is run by a third party with no uptime guarantee. If it goes away, the fallbacks keep the app working, and you can point `AI_CHAT_URL` at another keyless OpenAI-compatible endpoint, such as a free local [Ollama](https://ollama.com).
- Calls go through this app's server (`/api/ai`), because the service blocks direct browser requests. Only catalogue data, book titles and the reader's question are sent, never names or emails.
- Model replies are validated with Zod. Invented `/books/` links are dropped, and catalogue titles are linked automatically.

### Extras
- **Barcode scanning** with the phone camera (native BarcodeDetector, ZXing fallback) to add books by ISBN; USB barcode scanners work at the check-in desk because they type like a keyboard.
- **Waitlists.** When a fully-booked title comes back (or a new copy is added), the next person in line gets a copy reserved for the library's pickup window and is notified. Reservations that aren't collected expire and pass to the next person.
- **Dashboards.** Librarians see copies in use, overdue, members, waitlists, fines owed, weekly borrowing, popular genres, most-borrowed titles and live activity. Members see their nightstand, alerts, fines and picks.
- **Ratings and reviews**, plus **More like this** suggestions (same author, genre and overlapping tags).
- **Activity log**: an audit trail of every loan, return, hold, copy, fine, catalogue, role and settings change, with filters.
- **CSV import and export** of the catalogue (imports create barcoded copies).
- **Ctrl/Cmd + K command palette** to search books, jump to pages, run smart search or ask the AI.
- **Dark mode**, a responsive layout for phones, accessible components (Radix), and generated typographic covers for books without cover art.

---

## Configuration

All variables are optional locally. See `.env.example`.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (e.g. Neon). Empty means the embedded PGlite database. |
| `AUTH_SECRET` | Session encryption secret. **Required in production** (`npx auth secret`). |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Enables "Continue with Google". Redirect URI: `<url>/api/auth/callback/google` |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | Enables "Continue with GitHub". Callback URL: `<url>/api/auth/callback/github` |
| `ADMIN_EMAILS` | Comma-separated emails that become admins of the main library on SSO sign-in |
| `DEMO_MODE` | `false` hides the demo accounts and disables demo resets |
| `CRON_SECRET` | Protects the daily job (`/api/cron/daily`). Vercel sends it automatically when set. |
| `DEMO_RESET` | `false` keeps the daily job from resetting demo data |
| `RESEND_API_KEY` / `EMAIL_FROM` | Optional: email notifications through [Resend](https://resend.com) |
| `AI_ENABLED` | `false` turns all AI features off (default: on, free, no key needed) |
| `AI_CHAT_URL` / `AI_MODEL` | Optional: any keyless OpenAI-compatible endpoint, e.g. local Ollama `http://localhost:11434/v1/chat/completions` + `llama3.2` |

## Deploying to Vercel

1. Push the repo to GitHub and import it in Vercel.
2. Create a free Postgres database (Neon, from the Vercel Marketplace or neon.tech) and set `DATABASE_URL`.
3. Set `AUTH_SECRET`, `CRON_SECRET`, plus the SSO variables you want. The AI needs no setup.
4. Deploy. The `vercel-build` script runs `db:setup` (migrations and seed-if-empty) before `next build`. If `DATABASE_URL` is missing, the build stops with a clear error instead of shipping a site without a database.
5. Add `https://<your-app>.vercel.app/api/auth/callback/google` (and `/github`) to your OAuth apps.

The daily job is registered from `vercel.json`. Migrations are written to run safely on a database that already has data (see `tests/migrations.test.ts`).

## Project structure

```
src/
  app/
    login/                 Sign-in page (SSO + demo roles)
    (app)/                 Signed-in area with the sidebar layout
      dashboard/           Member & librarian dashboards, charts, AI picks
      books/               Catalogue, book detail with copies, add/edit, CSV import
      loans/               My loans and fines, circulation desk with barcode check-in
      members/             People, roles, balances and fines
      reports/             Reports and charts
      settings/            Library rules, new libraries, demo reset
      assistant/           "Ask the Librarian" chat
      activity/            Audit log
    api/                   Auth, AI proxy, daily cron, CSV exports, autofill, quick search
  auth.ts                  Auth.js config (providers, account creation)
  lib/
    db/                    Drizzle schema, client (Neon or PGlite), seed data
    library.ts             Domain logic: search, availability, copies, loans, holds, fines
    reminders.ts           Notifications and the daily reminder job
    money.ts               Fine arithmetic (pure, shared by app, seed and tests)
    session.ts / tenancy.ts Current user, current library, memberships
    stats.ts               Dashboard and report queries
    actions/               Server actions (permission-checked)
    ai.ts / ai-client.ts   AI prompts, response parsing, fallbacks (provider: api/ai)
    permissions.ts         Role → permission map
  components/              UI (shadcn/ui primitives, shell, switcher, notifications, scanner)
drizzle/                   SQL migrations
docs/DECISIONS.md          Design decisions and trade-offs
tests/                     Vitest suites
```

## Testing

```bash
npm test
```

49 tests run in about 3 seconds with [Vitest](https://vitest.dev). [GitHub Actions](.github/workflows/ci.yml) runs lint, typecheck, a production build and the tests twice on every push: once on the embedded database, and once on a real Postgres server through the same driver production uses. The domain tests use a real Postgres (PGlite, in memory) with the app's own migrations, so they exercise the actual SQL, transactions and row locks rather than mocks. Each test starts from an empty database.

| Area | What is checked |
| --- | --- |
| Borrowing | Library's loan period and limits, specific copy by barcode, lost/withdrawn copies never lent, no copies left, same book twice, overdue block, unpaid-fines block, two simultaneous requests for the last copy |
| Returning & fines | Copy freed, late fee per calendar day with notification, grace period and cap, barcode check-in with condition, double return refused, own loans only, fines settle once |
| Copies | Sequential barcodes per library, new copies serve the waitlist, can't withdraw a copy on loan, lost loans retire the copy and charge the fee |
| Renewing | Up to the library's limit, overdue renewals count from today, blocked while someone waits |
| Waitlist | Queue order and position, duplicates refused, reservation for the pickup window with notification, reserved copy blocked for others, expiry and cancellation pass it on |
| Tenancy | Search, book pages and circulation see only the current library; only members can borrow |
| Reminders | Due-soon and overdue reminders created once however often the job runs |
| Seed, reports & migrations | Seed data is consistent and resets identically; dashboard and report queries add up; migrations upgrade a populated single-library database without losing data |
| Fine maths, permissions, CSV | Calendar days late, grace, cap; access per role; CSV round-trips |
