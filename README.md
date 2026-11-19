# Folio · Mini Library Management System

A small but complete library app: catalogue books, lend and return them, run waitlists, and help readers find their next book with an AI librarian.

**Live demo:** https://folio-library-zeta.vercel.app · **Source:** https://github.com/DanAsad/folio-library

Sign in with GitHub, or pick a one-click demo account on the login page:

| Demo account | Role | What to try |
| --- | --- | --- |
| Jordan Lee | Member | Has an overdue book, so borrowing is blocked until it's returned. Is on a waitlist. Try smart search and the AI librarian. |
| Sam Rivera | Librarian | Add a book by ISBN (auto-fill), check books out to members and in at the desk, see the circulation dashboard. |
| Alex Morgan | Admin | Everything above plus member and role management. |

All visitors share one sample library, so you may see other people's changes.

**Stack:** Next.js 16 (App Router, Server Actions) · TypeScript · Tailwind CSS 4 + shadcn/ui · PostgreSQL (Drizzle ORM; Neon in production, embedded PGlite locally) · Auth.js (Google / GitHub SSO + demo accounts) · free open-source AI (GPT-OSS 20B through Pollinations; no account or API key) · Open Library API.

---

## Quick start (no accounts needed)

Requirements: **Node.js 20.9+**.

```bash
npm install
npm run dev
```

Open http://localhost:3000 and pick a demo account: **Member**, **Librarian** or **Admin**.

That's it. With no `DATABASE_URL`, the app starts an embedded Postgres (PGlite) in `./.data`, creates the tables and seeds a sample library: 40 books with real covers, 7 users, about 170 loans (some overdue), a waitlist and reviews.

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build && npm start` | Production build |
| `npm run db:reset` | Wipe and re-seed the database (stop the dev server first when using the embedded DB) |
| `npm run db:setup` | Apply migrations and seed if empty (used for hosted Postgres) |
| `npm run db:generate` | Generate a new SQL migration after changing `src/lib/db/schema.ts` |
| `npm run lint` / `npm run typecheck` | Static checks |

To enable optional features, copy `.env.example` to `.env` and fill in what you need (see [Configuration](#configuration)).

---

## Features

### Core
- **Book management.** Add, edit and delete books with title, author, ISBN, genre, tags, year, publisher, pages, language, description, cover, number of copies and shelf location. Validation runs on the server, and a book can't be deleted while copies are on loan.
- **Check-out / check-in.** Members borrow and return their own books. Librarians check books out to any member and check them in at the desk. Loans last 14 days, and the app enforces a 5-book limit, no new loans while something is overdue, and up to 2 renewals (blocked when someone is waiting). Multiple copies per title are tracked.
  > The brief describes "checked in (borrowed)" and "checked out (returned)", which reverses the usual library terms. The app avoids the confusion with plain **Borrow / Return** buttons for members, and **Check out to member / Check in** for librarians.
- **Search.** Instant search across title, author, ISBN, genre, tags, publisher and description, or limit it to one field. Every word must match, and title matches rank first. Filters cover genre and "available now". Sort by best match, title, author, popularity, rating, year or recently added. Switch between a cover grid and a table view.

### Authentication and roles
- **SSO** with Google and GitHub through Auth.js. A library account is created on first sign-in, and `ADMIN_EMAILS` promotes chosen emails to admin.
- **One-click demo accounts** for each role, so reviewers can try everything without an SSO account. Turn them off with `DEMO_MODE=false`.
- **Role-based permissions** (`src/lib/permissions.ts`), checked in every server action and protected page, not just hidden in the UI:

| | Member | Librarian | Admin |
| --- | :---: | :---: | :---: |
| Browse, search, borrow, return, renew, waitlist, review | ✓ | ✓ | ✓ |
| Add / edit / delete / import / export books | | ✓ | ✓ |
| Check out to and check in for any member, circulation desk | | ✓ | ✓ |
| Dashboard analytics, activity log, member list | | ✓ | ✓ |
| Change user roles | | | ✓ |

- Role changes apply immediately, because the role is re-read from the database on each request.

### AI features (free, no account)
The AI runs on a free, open-source model (GPT-OSS 20B) through [Pollinations](https://pollinations.ai)' anonymous tier. There's **no sign-up, no API key and no cost**, and it isn't tied to anyone's account. It works out of the box.

1. **Smart search.** Describe what you want ("short sci-fi from the 90s I can borrow today"), and the AI turns it into structured filters (genre, year range, availability, keywords, sort). The app shows how it read the request.
2. **Auto-cataloguing.** Type or scan an ISBN and click *Auto-fill*. Bibliographic facts come from Open Library, then the AI writes a spoiler-free blurb and picks a genre and tags that match the existing catalogue.
3. **Ask the Librarian.** A streaming chat assistant that knows the whole catalogue, live availability and the reader's history. It recommends only books the library owns, and every catalogue title it mentions links to the book's page.
4. **Picked for you.** Instant picks on the member dashboard from the reader's favourite genres. *Personalise with AI* replaces them with AI picks, each with a one-line reason tied to the reader's history.

**Limits of the free tier, and how the app handles them:**
- It allows about **one AI reply every 45 seconds** per server. If the AI is busy, the app says so with a countdown and falls back to plain keyword search, heuristic picks or Open Library data. Nothing breaks.
- Replies take roughly **10–30 seconds**, and the app shows a "thinking" status meanwhile.
- The free service is run by a third party with no uptime guarantee. If it goes away, the fallbacks keep the app working, and you can point `AI_CHAT_URL` at another keyless OpenAI-compatible endpoint, such as a free local [Ollama](https://ollama.com).
- Calls go through this app's server (`/api/ai`), because the service blocks direct browser requests. Only catalogue data, book titles and the reader's question are sent, never names or emails.
- Model replies are validated with Zod. Invented `/books/` links are dropped, and catalogue titles are linked automatically.

### Extras
- **Barcode scanning** with the phone camera (native BarcodeDetector, ZXing fallback), to add books or find them by ISBN.
- **Waitlists.** When a fully-booked title is returned, the next person in line gets a copy reserved for 3 days and sees a notice on their dashboard. Reservations that aren't picked up expire automatically.
- **Librarian dashboard.** Stats (copies in use, overdue, members, waitlist), a weekly borrowing chart, popular genres, most-borrowed titles, overdue follow-ups and live activity.
- **Member dashboard.** "On your nightstand" with due dates, overdue and pickup alerts, reading stats, top-rated books and new arrivals.
- **Ratings and reviews**, plus **More like this** suggestions (same author, genre and overlapping tags).
- **Activity log**, an audit trail of every loan, return, hold, catalogue change and role change, with filters.
- **CSV import and export** of the catalogue.
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
| `ADMIN_EMAILS` | Comma-separated emails that become admins on SSO sign-in |
| `DEMO_MODE` | `false` hides the demo accounts |
| `AI_ENABLED` | `false` turns all AI features off (default: on, free, no key needed) |
| `AI_CHAT_URL` / `AI_MODEL` | Optional: any keyless OpenAI-compatible endpoint, e.g. local Ollama `http://localhost:11434/v1/chat/completions` + `llama3.2` |

## Deploying to Vercel

1. Push the repo to GitHub and import it in Vercel.
2. Create a free Postgres database (Neon, from the Vercel Marketplace or neon.tech) and set `DATABASE_URL`.
3. Set `AUTH_SECRET`, plus the SSO variables you want. The AI needs no setup.
4. Deploy. The `vercel-build` script runs `db:setup` (migrations and seed-if-empty) before `next build`. If `DATABASE_URL` is missing, the build stops with a clear error instead of shipping a site without a database.
5. Add `https://<your-app>.vercel.app/api/auth/callback/google` (and `/github`) to your OAuth apps.

## Project structure

```
src/
  app/
    login/                 Sign-in page (SSO + demo roles)
    (app)/                 Signed-in area with the sidebar layout
      dashboard/           Member & librarian dashboards, charts, AI picks
      books/               Catalogue, book detail, add/edit, CSV import
      loans/               My loans, circulation desk, waitlists
      assistant/           "Ask the Librarian" chat
      members/  activity/  Staff pages
    api/                   Auth, AI proxy, autofill, quick search, CSV export
  auth.ts                  Auth.js config (providers, role sync)
  lib/
    db/                    Drizzle schema, client (Neon or PGlite), seed data
    library.ts             Domain logic: search, availability, loans, holds queue
    actions/               Server actions (permission-checked)
    ai.ts / ai-client.ts   AI prompts, response parsing, fallbacks (provider: api/ai)
    permissions.ts         Role → permission map
  components/              UI (shadcn/ui primitives, book cover, scanner, shell)
drizzle/                   SQL migrations
scripts/                   DB setup/seed and Open Library metadata fetcher
```

## Design notes
- **Availability** = copies − active loans − copies reserved for the waitlist. Loans and holds run inside transactions that lock the book row, so two people can't take the last copy at the same time.
- **Server-first.** Pages are React Server Components that query the database directly. Mutations are server actions that re-check permissions and revalidate the UI.
- **Seed data.** Book descriptions are written for this project, and covers, ISBNs and page counts come from Open Library (`scripts/fetch-seed-metadata.ts`).
