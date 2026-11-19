import { and, desc, eq } from "drizzle-orm";
import { format } from "date-fns";
import { aiEnabled, librarianSystemPrompt } from "@/lib/ai";
import { getDb } from "@/lib/db/client";
import { loans } from "@/lib/db/schema";
import { searchBooks } from "@/lib/library";
import { requireUser } from "@/lib/session";
import { Chat } from "./chat";

export const metadata = { title: "Ask the Librarian" };

export default async function AssistantPage({ searchParams }: PageProps<"/assistant">) {
  const user = await requireUser();
  const q = (await searchParams).q;
  const db = await getDb();
  const [catalogue, history] = await Promise.all([
    searchBooks({ libraryId: user.library.id, sort: "title", limit: 400 }),
    db.query.loans.findMany({
      where: and(eq(loans.libraryId, user.library.id), eq(loans.userId, user.id)),
      with: { book: { columns: { title: true, author: true } } },
      orderBy: desc(loans.borrowedAt),
      limit: 25,
    }),
  ]);

  // Only catalogue data and book titles go to the AI: no names or emails.
  const system = librarianSystemPrompt({
    library: user.library,
    today: format(new Date(), "EEEE, MMMM d, yyyy"),
    catalogue: catalogue
      .map(
        (b) =>
          `${b.id} | ${b.title} | ${b.author} | ${b.genre ?? ""} | ${b.publishedYear ?? ""} | ${b.tags.join(", ")} | ${
            b.available > 0 ? `available (${b.available} of ${b.totalCopies})` : b.waitingHolds ? `on loan, ${b.waitingHolds} waiting` : "on loan"
          }`,
      )
      .join("\n"),
    history: history.length
      ? history.map((l) => `- ${l.book.title} by ${l.book.author}${l.returnedAt ? "" : " (currently borrowed)"}`).join("\n")
      : "- No books borrowed yet.",
  });

  return (
    <Chat
      userName={user.name.split(" ")[0]}
      enabled={aiEnabled()}
      system={system}
      books={catalogue.map((b) => ({ id: b.id, title: b.title }))}
      initialQuestion={typeof q === "string" ? q : undefined}
    />
  );
}
