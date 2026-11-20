import { z } from "zod";

/**
 * Browser side of the free, account-free AI features: prompts, response parsing and
 * transport. Requests go to this app's /api/ai route, which forwards them to a free
 * OpenAI-compatible endpoint (Pollinations' anonymous tier by default; see that route).
 *
 * Every feature has a non-AI fallback (keyword search, heuristic picks, Open Library data).
 */
export const SORT_VALUES = ["relevance", "title", "author", "newest", "year", "popular", "rating"] as const;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** What went wrong, as a code the UI turns into a message in the reader's language (`ai.errors.*`). */
export type AiErrorCode = "busy" | "noResponse" | "http" | "unexpected" | "noPicks" | "off" | "signIn" | "tooLong";

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    readonly retryAfter?: number,
    readonly status?: number,
  ) {
    super(code);
  }
}

/** Language names for prompts ("Reply in French"). */
export const LANGUAGE_NAMES = { en: "English", fr: "French", es: "Spanish", it: "Italian" } as const;
export type AiLanguage = keyof typeof LANGUAGE_NAMES;

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

let blockedUntil = 0;

/** Seconds until the free tier accepts another request (0 = ready). */
export function aiWaitSeconds() {
  return Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));
}

async function post(body: { messages: ChatMessage[]; json?: boolean; stream?: boolean }, timeoutMs: number, signal?: AbortSignal) {
  const wait = aiWaitSeconds();
  if (wait > 0) throw new AiError("busy", wait);

  let res: Response;
  try {
    res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]),
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new AiError("noResponse");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After")) || data.retryAfter || 45;
      blockedUntil = Date.now() + retryAfter * 1000;
      throw new AiError("busy", retryAfter);
    }
    const code: AiErrorCode = res.status === 401 ? "signIn" : res.status === 503 ? "off" : res.status === 413 ? "tooLong" : res.status === 504 ? "noResponse" : "http";
    throw new AiError(code, undefined, res.status);
  }
  return res;
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new AiError("unexpected");
  }
}

export async function completeJson<S extends z.ZodType>(schema: S, messages: ChatMessage[], timeoutMs = 45_000): Promise<z.infer<S>> {
  const res = await post({ messages, json: true }, timeoutMs);
  const data = await res.json();
  const parsed = schema.safeParse(extractJson(data?.choices?.[0]?.message?.content ?? ""));
  if (!parsed.success) throw new AiError("unexpected");
  return parsed.data;
}

/** Streams the reply as plain text chunks (reasoning tokens are skipped). */
export async function* streamChat(messages: ChatMessage[], signal?: AbortSignal): AsyncGenerator<string> {
  const res = await post({ messages, stream: true }, 120_000, signal);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.trim();
      if (!data.startsWith("data:")) continue;
      const payload = data.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const text = JSON.parse(payload)?.choices?.[0]?.delta?.content;
        if (typeof text === "string" && text) yield text;
      } catch {
        // keep-alive or partial line
      }
    }
  }
}

// Lenient field helpers: small open models sometimes return "" or numbers as strings.
const nullableString = z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().nullable());
const nullableInt = z.preprocess((v) => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null;
}, z.number().int().nullable());

// ---------------------------------------------------------------------------
// 1. Smart search: natural language -> filters
// ---------------------------------------------------------------------------

const SearchPlan = z.object({
  keywords: nullableString,
  genre: nullableString,
  yearFrom: nullableInt,
  yearTo: nullableInt,
  availableOnly: z.preprocess((v) => v === true || v === "true", z.boolean()),
  sort: z.enum(SORT_VALUES).catch("relevance"),
  explanation: z.string().catch(""),
});

export async function interpretSearch(query: string, genres: string[], language: AiLanguage = "en") {
  const plan = await completeJson(SearchPlan, [
    {
      role: "system",
      content: `You turn a library visitor's request into catalogue search filters. Reply with JSON only, exactly this shape:
{"keywords": string|null, "genre": string|null, "yearFrom": number|null, "yearTo": number|null, "availableOnly": boolean, "sort": "relevance"|"title"|"author"|"newest"|"year"|"popular"|"rating", "explanation": string}

Available genres: ${genres.join(", ")}.
Rules:
- "genre" must be exactly one of the available genres, or null. Map synonyms (e.g. "sci-fi" -> "Science Fiction").
- Decades and eras become a year range (e.g. "from the 90s" -> 1990 to 1999, "before 1950" -> yearTo 1949).
- "keywords": a few distinctive words (themes, topics, author or title fragments), never filler like "books" or "good". Null if genre/years already cover it.
- "availableOnly": true only if they want something they can borrow now/today.
- sort: "popular" for popular/trending, "rating" for best/highly rated, "newest" for recently added, "year" for recent releases, else "relevance".
- "explanation": one friendly sentence under 20 words, written in ${LANGUAGE_NAMES[language]}.
- The request may be in any language; genre names must still be copied exactly from the list.`,
    },
    { role: "user", content: query.trim().slice(0, 300) },
  ]);
  const genre = plan.genre ? genres.find((g) => g.toLowerCase() === plan.genre!.toLowerCase()) : undefined;
  return { ...plan, genre: genre ?? null };
}

// ---------------------------------------------------------------------------
// 2. Auto-catalogue
// ---------------------------------------------------------------------------

const Catalogue = z.object({
  description: z.string().min(10),
  genre: z.string().min(2),
  tags: z.preprocess(
    (v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []),
    z.array(z.string()).transform((t) => t.map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 6)),
  ),
  publishedYear: nullableInt,
  language: nullableString,
});

export function generateCatalogueEntry(book: { title: string; author: string; isbn?: string; notes?: string }, genres: string[]) {
  return completeJson(Catalogue, [
    {
      role: "system",
      content: `You are a meticulous librarian writing catalogue entries. Reply with JSON only, exactly this shape:
{"description": string, "genre": string, "tags": string[], "publishedYear": number|null, "language": string|null}

- description: a 2-3 sentence, spoiler-free blurb in an inviting library tone.
- genre: prefer one of the existing genres: ${genres.join(", ")}. Only invent a new one if none fit.
- tags: 4-6 short lowercase subject tags.
- publishedYear: year of FIRST publication if you are confident, else null. Never guess facts.`,
    },
    {
      role: "user",
      content: [`Title: ${book.title}`, `Author: ${book.author}`, book.isbn && `ISBN: ${book.isbn}`, book.notes && `Publisher data: ${book.notes.slice(0, 1500)}`]
        .filter(Boolean)
        .join("\n"),
    },
  ]);
}

// ---------------------------------------------------------------------------
// 3. Personal recommendations
// ---------------------------------------------------------------------------

const Picks = z.object({ picks: z.array(z.object({ id: z.union([z.string(), z.number()]), reason: z.string() })).catch([]) });

export type PickCandidate = { id: string; title: string; author: string; genre: string | null; tags: string[]; available: number };
export type HistoryItem = { title: string; author: string; genre: string | null; rating?: number | null };

export async function recommendBooks(history: HistoryItem[], candidates: PickCandidate[], language: AiLanguage = "en") {
  // Short numbers instead of UUIDs: a smaller prompt, and easy for a small model to copy.
  const res = await completeJson(Picks, [
    {
      role: "system",
      content: `You are a warm, well-read librarian recommending books from THIS library only. Reply with JSON only:
{"picks": [{"id": number, "reason": string}]}
Pick exactly 4 candidates by their number. Prefer available books, mix familiar and adventurous picks, and never pick
something the reader has already read. Each reason is one short sentence addressed to the reader ("you") that refers to what they've read,
written in ${LANGUAGE_NAMES[language]}.`,
    },
    {
      role: "user",
      content: `Reader's history (most recent first):\n${
        history.length
          ? history.map((h) => `- ${h.title} by ${h.author} (${h.genre ?? "?"})${h.rating ? `, rated ${h.rating}/5` : ""}`).join("\n")
          : "- (no history yet: suggest crowd-pleasers across genres)"
      }\n\nCandidates (number | title | author | genre | tags | status):\n${candidates
        .map((c, i) => `${i + 1} | ${c.title} | ${c.author} | ${c.genre ?? ""} | ${c.tags.join(", ")} | ${c.available > 0 ? "available" : "on loan"}`)
        .join("\n")}`,
    },
  ]);
  const seen = new Set<string>();
  const out: { id: string; reason: string }[] = [];
  for (const p of res.picks) {
    const book = candidates[Number(String(p.id).replace(/\D/g, "")) - 1];
    if (book && !seen.has(book.id) && p.reason) {
      seen.add(book.id);
      out.push({ id: book.id, reason: p.reason.replace(/[*_`]/g, "").trim() });
    }
  }
  if (!out.length) throw new AiError("noPicks");
  return out.slice(0, 4);
}
