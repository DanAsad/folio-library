/**
 * One-off helper: looks up each starter book on Open Library and stores the ISBN,
 * cover, page count and publisher in src/lib/db/seed-metadata.json, so seeding is
 * fast and works offline.  Run with: npx tsx scripts/fetch-seed-metadata.ts
 */
import fs from "node:fs";
import path from "node:path";
import { SEED_BOOKS } from "../src/lib/db/seed-books";

type Meta = { isbn?: string; coverUrl?: string; pages?: number; publisher?: string };

async function lookup(title: string, author: string): Promise<Meta> {
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("title", title);
  url.searchParams.set("author", author);
  url.searchParams.set("limit", "1");
  url.searchParams.set("fields", "isbn,cover_i,number_of_pages_median,publisher,cover_edition_key");
  const res = await fetch(url, { headers: { "User-Agent": "MiniLibrary/1.0 (demo app)" } });
  if (!res.ok) return {};
  const doc = (await res.json()).docs?.[0];
  if (!doc) return {};
  const isbn13 = (doc.isbn as string[] | undefined)?.find((i) => i.length === 13 && i.startsWith("978"));
  return {
    isbn: isbn13,
    coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined,
    pages: doc.number_of_pages_median ?? undefined,
    publisher: (doc.publisher as string[] | undefined)?.[0],
  };
}

async function main() {
  const out: Record<string, Meta> = {};
  for (const b of SEED_BOOKS) {
    out[b.title] = await lookup(b.title, b.author);
    console.log(b.title, "->", out[b.title].coverUrl ? "cover" : "no cover", out[b.title].isbn ?? "");
  }
  const file = path.join(__dirname, "..", "src", "lib", "db", "seed-metadata.json");
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log("Wrote", file);
}

main();
