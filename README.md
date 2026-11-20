# Folio · Mini Library Management System

[![CI](https://github.com/DanAsad/folio-library/actions/workflows/ci.yml/badge.svg)](https://github.com/DanAsad/folio-library/actions/workflows/ci.yml)

A small but complete library system: manage books and their physical copies, check them in and out, search the catalogue, run waitlists and fines, and get reading help from an AI librarian. It runs several libraries side by side and is available in English, French, Spanish and Italian.

- **Live app:** https://folio-library-zeta.vercel.app
- **Public catalogue (no sign-in):** https://folio-library-zeta.vercel.app/catalog
- **Design decisions and trade-offs:** [docs/DECISIONS.md](docs/DECISIONS.md)

## Try it

Pick a demo account on the login page (one click, no password). The data resets every night at 04:00 UTC, so feel free to change things.

| Account | Role | Try this |
| --- | --- | --- |
| Jordan | Member | Borrow, return and renew books, join a waitlist, check the 🔔 notifications, ask the AI librarian |
| Sam | Librarian | Check books in at the desk by barcode (e.g. `CEN-00021`), lend a specific copy, record fine payments, view reports |
| Alex | Admin | Everything above, plus roles, each library's rules, opening a new library and resetting the demo |

## How it meets the brief

**Core**
- **Book management:** add, edit and delete books with title, author, ISBN, genre, tags, year, publisher, pages, language, description, cover and shelf. Each book has barcoded copies with a condition and status. CSV import and export. Typing or scanning an ISBN fills in the details from Open Library.
- **Check-in / check-out:** members borrow and return their own books; librarians lend to any member and check books in at the desk by scanning or typing a barcode. Due dates, renewals, waitlists with reserved copies, and automatic late fees.
  *The brief uses "checked in" for borrowed and "checked out" for returned, the reverse of library usage, so the app avoids the terms with plain **Borrow / Return** buttons.*
- **Search:** instant search across title, author, ISBN, genre, tags, publisher and copy barcodes, with filters and sorting.

**Bonus**
- **Deployed** on Vercel with a Neon Postgres database, plus a daily job for reminders and the demo reset.
- **Authentication with roles:** admin, librarian and member, set per library and checked on the server for every action, not just hidden in the UI.
- **AI features** (free, no API key): an "Ask the Librarian" chat that only recommends books the library has, natural-language "smart search", personal picks, and auto-written book descriptions. Each has a non-AI fallback.
- **Extras:** several libraries with their own rules, fines, notifications, reports with CSV exports, an activity log, a public catalogue, four languages, dark mode and a mobile layout.

## Run it locally

Requirements: **Node.js 20.9+**. No database or accounts needed.

```bash
npm install
npm run dev
```

Open http://localhost:3000 and pick a demo account. Without a `DATABASE_URL`, the app starts an embedded Postgres (PGlite) in `./.data`, creates the tables and loads sample data.

| Command | What it does |
| --- | --- |
| `npm test` | Run the 60 automated tests |
| `npm run lint` / `npm run typecheck` | Static checks |
| `npm run build && npm start` | Production build |
| `npm run db:reset` | Wipe and reload the sample data (stop the dev server first) |

Optional settings live in [`.env.example`](.env.example): `DATABASE_URL` for a hosted Postgres, `AUTH_SECRET` (required in production), `CRON_SECRET` for the daily job, and `RESEND_API_KEY` / `EMAIL_FROM` for email reminders.

## Deploy

1. Import the repo in Vercel and add a free Neon Postgres database (`DATABASE_URL`).
2. Set `AUTH_SECRET` and `CRON_SECRET`.
3. Deploy. The build applies database migrations and loads sample data if the database is empty.

## Tech

Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind CSS + shadcn/ui · PostgreSQL with Drizzle ORM · Auth.js · Vitest · GitHub Actions · Vercel.

The business rules live in one module (`src/lib/library.ts`) and run inside database transactions, so two people can't take the last copy at once. Tests run against a real Postgres, and CI runs lint, typecheck, the tests (twice: embedded and server Postgres) and a production build on every push.
