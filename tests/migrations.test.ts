import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

// Runs the real SQL migration files in order over data in the original (single-library)
// shape, to prove the multi-library migration is safe on a database that already has data.
const dir = path.resolve(__dirname, "../drizzle");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const run = async (db: PGlite, file: string) => {
  for (const statement of fs.readFileSync(path.join(dir, file), "utf8").split("--> statement-breakpoint")) {
    if (statement.trim()) await db.exec(statement);
  }
};

describe("migrations", () => {
  it("upgrades an existing single-library database without losing data", async () => {
    const db = new PGlite();
    await run(db, files[0]);

    // Data as the first version of the app stored it.
    await db.exec(`
      insert into users (id, email, name, role) values
        ('00000000-0000-0000-0000-00000000000a', 'admin@test.local', 'Ada', 'admin'),
        ('00000000-0000-0000-0000-00000000000b', 'reader@test.local', 'Ben', 'member'),
        ('00000000-0000-0000-0000-00000000000c', 'other@test.local', 'Cy', 'member');
      insert into books (id, title, author, total_copies) values
        ('00000000-0000-0000-0000-0000000000b1', 'Two Copies', 'A', 2),
        ('00000000-0000-0000-0000-0000000000b2', 'One Copy', 'B', 1);
      insert into loans (book_id, user_id, borrowed_at, due_at, returned_at) values
        ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', now() - interval '20 days', now() - interval '6 days', now() - interval '3 days'),
        ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', now() - interval '5 days', now() + interval '9 days', null),
        ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000c', now() - interval '2 days', now() + interval '12 days', null);
      insert into holds (book_id, user_id) values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-00000000000c');
      insert into activity (action, message) values ('book.create', 'Added a book');
    `);

    for (const file of files.slice(1)) await run(db, file);

    const one = async <T,>(q: string) => (await db.query<T>(q)).rows;
    expect(await one(`select name, code from libraries`)).toEqual([{ name: "Folio Central Library", code: "CEN" }]);
    expect(await one(`select u.name, m.role from memberships m join users u on u.id = m.user_id order by u.name`)).toEqual([
      { name: "Ada", role: "admin" },
      { name: "Ben", role: "member" },
      { name: "Cy", role: "member" },
    ]);
    // One copy row per counted copy, with barcodes.
    expect(await one(`select b.title, count(c.*)::int as n from books b join copies c on c.book_id = b.id group by b.title order by b.title`)).toEqual([
      { title: "One Copy", n: 1 },
      { title: "Two Copies", n: 2 },
    ]);
    expect(await one(`select barcode from copies order by barcode limit 1`)).toEqual([{ barcode: "CEN-00001" }]);
    // Every loan has a copy, and the two open loans are on different copies.
    expect(await one(`select count(*)::int as n from loans where copy_id is null or library_id is null`)).toEqual([{ n: 0 }]);
    expect(await one(`select count(distinct copy_id)::int as n from loans where returned_at is null`)).toEqual([{ n: 2 }]);
    expect(await one(`select count(*)::int as n from holds where library_id is not null`)).toEqual([{ n: 1 }]);
    expect(await one(`select count(*)::int as n from activity where library_id is not null`)).toEqual([{ n: 1 }]);
    // The old columns are gone.
    const cols = await one<{ column_name: string }>(`select column_name from information_schema.columns where table_name in ('users', 'books')`);
    expect(cols.map((c) => c.column_name)).not.toContain("total_copies");
    expect(cols.map((c) => c.column_name)).not.toContain("role");
    await db.close();
  });

  it("creates no phantom library on an empty database", async () => {
    const db = new PGlite();
    for (const file of files) await run(db, file);
    expect((await db.query(`select * from libraries`)).rows).toHaveLength(0);
    await db.close();
  });
});
