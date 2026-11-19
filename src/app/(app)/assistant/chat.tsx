"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, RotateCcw, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown";
import { AiError, streamChat } from "@/lib/ai-client";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

/**
 * Small open models don't always follow the "link every book" rule, so we link the first
 * mention of each catalogue title ourselves, leaving existing markdown links untouched.
 */
function makeTitleLinker(books: { id: string; title: string }[]) {
  const sorted = [...books].filter((b) => b.title.length >= 4).sort((a, b) => b.title.length - a.title.length);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Treat typographic and plain hyphens alike, since models often swap them.
  const patterns = sorted.map((b) => ({ b, re: new RegExp(`(?<![\\w\\[])${esc(b.title).replace(/-/g, "[-‐-―]")}(?![\\w\\]])`) }));
  return (text: string) => {
    const linked = new Set(Array.from(text.matchAll(/\]\(\/books\/([0-9a-f-]{36})\)/gi), (m) => m[1]));
    // Split into existing links (kept as-is) and plain segments (eligible for linking).
    const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
    for (const { b, re } of patterns) {
      if (linked.has(b.id)) continue;
      for (let i = 0; i < parts.length; i += 2) {
        if (re.test(parts[i])) {
          const [before, ...rest] = parts[i].split(re);
          const after = rest.join(b.title);
          parts.splice(i, 1, before, `[${b.title}](/books/${b.id})`, after);
          linked.add(b.id);
          break;
        }
      }
    }
    return parts.join("");
  };
}

const SUGGESTIONS = [
  "I loved Project Hail Mary. What should I read next?",
  "Something short and gripping I can borrow today",
  "Which classics do you have, and which are available?",
  "Recommend a fantasy series starter for a teenager",
  "How do waitlists and renewals work here?",
];

export function Chat({
  userName,
  enabled,
  system,
  books,
  initialQuestion,
}: {
  userName: string;
  enabled: boolean;
  system: string;
  books: { id: string; title: string }[];
  initialQuestion?: string;
}) {
  const linkify = useMemo(() => makeTitleLinker(books), [books]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const askedInitial = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || streaming || !enabled) return;
    const history: Msg[] = [...messages, { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Keep the last 20 turns so the prompt stays small.
    const recent = history.slice(-20);
    let sent = false;
    try {
      for await (const chunk of streamChat([{ role: "system", content: system }, ...recent], ctrl.signal)) {
        sent = true;
        setMessages((m) => {
          const last = m[m.length - 1];
          return [...m.slice(0, -1), { ...last, content: last.content + chunk }];
        });
      }
      if (!sent) {
        setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: "_Sorry, I couldn't come up with an answer. Please try rephrasing._" }]);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const msg = err instanceof AiError ? err.message : "Connection lost. Please try again.";
        setMessages((m) => {
          const last = m[m.length - 1];
          return [...m.slice(0, -1), { role: "assistant", content: last.content ? `${last.content}\n\n_${msg}_` : `_${msg}_` }];
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  useEffect(() => {
    if (initialQuestion && !askedInitial.current) {
      askedInitial.current = true;
      send(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  return (
    <div className="mx-auto flex h-[calc(100dvh-7.5rem)] max-w-3xl flex-col lg:h-[calc(100dvh-8.5rem)]">
      <div className="flex items-center justify-between pb-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold">
            <Sparkles className="size-6 text-primary" /> Ask the Librarian
          </h1>
          <p className="text-sm text-muted-foreground">Recommendations and answers from Folio, who knows every book on our shelves.</p>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setMessages([])} disabled={streaming}>
            <RotateCcw /> New chat
          </Button>
        )}
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto rounded-xl border bg-card/60 p-4 sm:p-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <Sparkles className="size-6" />
            </div>
            <div className="space-y-1">
              <p className="font-heading text-2xl">Hi {userName}, what are you in the mood to read?</p>
              <p className="text-sm text-muted-foreground">
                {enabled ? "I can only recommend books we actually have, and I'll tell you if they're on the shelf." : "The AI librarian is turned off on this deployment."}
              </p>
            </div>
            {enabled && (
              <div className="flex max-w-xl flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="rounded-full border bg-background px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={cn("flex gap-3", m.role === "user" && "justify-end")}>
              {m.role === "assistant" && (
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Sparkles className="size-3.5" />
                </div>
              )}
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                  m.role === "user" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-background shadow-xs ring-1 ring-border",
                )}
              >
                {m.role === "assistant" ? (
                  m.content ? (
                    <Markdown text={linkify(m.content)} />
                  ) : (
                    <span className="flex items-center gap-1 py-1.5" aria-label="Thinking">
                      {[0, 1, 2].map((d) => (
                        <span key={d} className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${d * 120}ms` }} />
                      ))}
                      <span className="ml-2 text-xs text-muted-foreground">Thinking… the free AI can take up to 30 seconds</span>
                    </span>
                  )
                ) : (
                  <p className="whitespace-pre-wrap">{m.content}</p>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="mt-4 flex items-end gap-2 rounded-xl border bg-card p-2 shadow-sm focus-within:ring-3 focus-within:ring-ring/30"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={enabled ? "Ask about a book, an author, or what to read next…" : "AI is not configured"}
          disabled={!enabled}
          rows={1}
          className="max-h-40 min-h-10 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        {streaming ? (
          <Button type="button" size="icon" variant="secondary" onClick={() => abortRef.current?.abort()} aria-label="Stop">
            <Square />
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!input.trim() || !enabled} aria-label="Send">
            <ArrowUp />
          </Button>
        )}
      </form>
    </div>
  );
}
