import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

/**
 * Two database modes, same schema and same SQL:
 *  - DATABASE_URL set  -> hosted Postgres (Neon, Supabase, RDS, ...) via postgres.js
 *  - no DATABASE_URL   -> embedded Postgres (PGlite) stored in ./.data, migrated and
 *                         seeded automatically, so the app runs with zero setup.
 */
async function createDb(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const client = postgres(url, { prepare: false, max: 5 });
    return drizzlePostgres(client, { schema });
  }

  if (process.env.VERCEL) {
    throw new Error("DATABASE_URL is not set. Add it in the Vercel project settings and redeploy.");
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  const dataDir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  fs.mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

  const { seedIfEmpty } = await import("./seed");
  await seedIfEmpty(db as unknown as DB);
  return db as unknown as DB;
}

const globalForDb = globalThis as unknown as { __libraryDb?: Promise<DB> };

export function getDb(): Promise<DB> {
  if (!globalForDb.__libraryDb) {
    globalForDb.__libraryDb = createDb().catch((err) => {
      globalForDb.__libraryDb = undefined;
      throw err;
    });
  }
  return globalForDb.__libraryDb;
}

export { schema };
