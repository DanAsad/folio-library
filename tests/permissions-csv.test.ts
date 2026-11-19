import { describe, expect, it } from "vitest";
import { PERMISSIONS, can, type Permission } from "@/lib/permissions";
import { parseCsv, toCsv } from "@/lib/csv";

describe("role permissions", () => {
  const all = Object.keys(PERMISSIONS) as Permission[];

  it("gives admins every permission", () => {
    for (const p of all) expect(can("admin", p)).toBe(true);
  });

  it("lets librarians run the desk but not manage users", () => {
    expect(can("librarian", "books:manage")).toBe(true);
    expect(can("librarian", "loans:manage")).toBe(true);
    expect(can("librarian", "activity:view")).toBe(true);
    expect(can("librarian", "users:manage")).toBe(false);
  });

  it("gives members no staff permissions", () => {
    for (const p of all) expect(can("member", p)).toBe(false);
  });

  it("denies everything when signed out", () => {
    for (const p of all) {
      expect(can(null, p)).toBe(false);
      expect(can(undefined, p)).toBe(false);
    }
  });
});

describe("CSV", () => {
  it("round-trips commas, quotes and line breaks", () => {
    const rows = [
      ["title", "author", "description"],
      ["Dune", "Frank Herbert", 'A "spice" planet, sand worms'],
      ["Poems", "Anon", "line one\nline two"],
    ];

    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it("handles a byte-order mark, CRLF line endings and empty fields", () => {
    const text = "﻿title,isbn,year\r\nNeuromancer,,1984\r\n";

    expect(parseCsv(text)).toEqual([
      ["title", "isbn", "year"],
      ["Neuromancer", "", "1984"],
    ]);
  });

  it("writes missing values as empty cells", () => {
    expect(toCsv([["a", null, undefined, 3]])).toBe("a,,,3");
  });
});
