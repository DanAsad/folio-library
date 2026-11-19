import { NextResponse } from "next/server";
import { searchBooks } from "@/lib/library";
import { getCurrentUser } from "@/lib/session";

/** Lightweight search used by the Ctrl+K command menu. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q")?.slice(0, 200) ?? "";
  const books = await searchBooks({ libraryId: user.library.id, q, limit: 8 });
  return NextResponse.json(books.map((b) => ({ id: b.id, title: b.title, author: b.author, available: b.available })));
}
