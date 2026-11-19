/**
 * Prepares the database: applies migrations, then seeds demo data if the catalogue
 * is empty.  Pass --reset to wipe everything and re-seed.
 *
 *   npm run db:setup            # migrate + seed if empty
 *   npm run db:reset            # wipe + re-seed
 *
 * Uses DATABASE_URL when set (e.g. Neon), otherwise the local embedded database.
 */
import "dotenv/config";
import path from "node:path";
import { getDb } from "../src/lib/db/client";
import { seed, seedIfEmpty } from "../src/lib/db/seed";

async function main() {
  const reset = process.argv.includes("--reset");
  const url = process.env.DATABASE_URL;

  if (url) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const postgres = (await import("postgres")).default;
    const client = postgres(url, { max: 1, prepare: false });
    await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    await client.end();
    console.log("✓ Migrations applied");
  }

  // For PGlite, getDb() migrates and seeds-if-empty on its own.
  const db = await getDb();
  const result = reset ? await seed(db, { reset: true }) : await seedIfEmpty(db);
  console.log(result ? `✓ Seeded ${JSON.stringify(result)}` : "✓ Database already has data, skipped seeding");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
