import "server-only";

export type OpenLibraryBook = {
  title?: string;
  author?: string;
  isbn?: string;
  publisher?: string;
  publishedYear?: number;
  pages?: number;
  coverUrl?: string;
  subjects?: string[];
};

const UA = { "User-Agent": "Folio-MiniLibrary/1.0 (demo library app)" };

function year(s?: string) {
  const m = s?.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  return m ? Number(m[1]) : undefined;
}

/** Looks a book up on Open Library, by ISBN or by title + author. */
export async function lookupOpenLibrary(opts: { isbn?: string | null; title?: string | null; author?: string | null }): Promise<OpenLibraryBook | null> {
  try {
    const isbn = opts.isbn?.replace(/[-\s]/g, "");
    if (isbn) {
      const res = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`, {
        headers: UA,
        signal: AbortSignal.timeout(8000),
      });
      const data = res.ok ? await res.json() : {};
      const b = data[`ISBN:${isbn}`];
      if (b) {
        return {
          title: b.subtitle ? `${b.title}: ${b.subtitle}` : b.title,
          author: b.authors?.map((a: { name: string }) => a.name).join(", "),
          isbn,
          publisher: b.publishers?.[0]?.name,
          publishedYear: year(b.publish_date),
          pages: b.number_of_pages,
          coverUrl: b.cover?.large ?? b.cover?.medium,
          subjects: b.subjects?.slice(0, 12).map((s: { name: string }) => s.name),
        };
      }
    }
    if (opts.title) {
      const url = new URL("https://openlibrary.org/search.json");
      url.searchParams.set("title", opts.title);
      if (opts.author) url.searchParams.set("author", opts.author);
      url.searchParams.set("limit", "1");
      url.searchParams.set("fields", "title,author_name,isbn,publisher,first_publish_year,number_of_pages_median,cover_i,subject");
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(8000) });
      const doc = res.ok ? (await res.json()).docs?.[0] : null;
      if (doc) {
        return {
          title: doc.title,
          author: doc.author_name?.join(", "),
          isbn: (doc.isbn as string[] | undefined)?.find((i) => i.length === 13),
          publisher: doc.publisher?.[0],
          publishedYear: doc.first_publish_year,
          pages: doc.number_of_pages_median,
          coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined,
          subjects: doc.subject?.slice(0, 12),
        };
      }
    }
  } catch (err) {
    console.warn("[openlibrary]", err);
  }
  return null;
}
