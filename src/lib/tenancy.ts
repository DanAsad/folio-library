// Tenant (library) helpers shared by pages and the session.
import { asc } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { libraries } from "@/lib/db/schema";

export const LIBRARY_COOKIE = "folio-library";

export async function defaultLibrary(db: DB) {
  const [lib] = await db.select().from(libraries).orderBy(asc(libraries.createdAt)).limit(1);
  return lib ?? null;
}
