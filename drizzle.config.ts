import { defineConfig } from "drizzle-kit";

// Migrations are generated from src/lib/db/schema.ts with `npm run db:generate`.
// They are applied automatically at startup for the local PGlite database, and by
// `npm run db:setup` (also run during Vercel builds) for a hosted Postgres.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
});
