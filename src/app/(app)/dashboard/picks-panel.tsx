"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { BookCover } from "@/components/book-cover";
import { AvailabilityBadge } from "@/components/books/bits";
import { recommendBooks, type HistoryItem } from "@/lib/ai-client";
import { aiErrorMessage } from "@/lib/ai-messages";
import { useI18n } from "@/i18n/client";

export type PickBook = {
  id: string;
  title: string;
  author: string;
  genre: string | null;
  tags: string[];
  coverUrl: string | null;
  available: number;
  totalCopies: number;
  waitingHolds: number;
  readyHolds: number;
  loanCount: number;
};

type Pick = { book: PickBook; reason: string };

export function PicksPanel({
  initial,
  candidates,
  history,
  aiAvailable,
}: {
  initial: Pick[];
  candidates: PickBook[];
  history: HistoryItem[];
  aiAvailable: boolean;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const [picks, setPicks] = useState(initial);
  const [byAi, setByAi] = useState(false);
  const [pending, start] = useTransition();

  const personalise = () =>
    start(async () => {
      try {
        const res = await recommendBooks(history, candidates, i18n.locale);
        const byId = new Map(candidates.map((c) => [c.id, c]));
        setPicks(res.map((p) => ({ book: byId.get(p.id)!, reason: p.reason })));
        setByAi(true);
      } catch (err) {
        toast.error(aiErrorMessage(i18n, err, "ai.picksFailed"));
      }
    });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Sparkles className="size-5 text-primary" /> {t("picks.title")}
        </h2>
        {byAi ? (
          <span className="text-xs text-muted-foreground">{t("picks.byAi")}</span>
        ) : aiAvailable ? (
          <Button size="sm" variant="outline" onClick={personalise} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {pending ? t("picks.asking") : t("picks.personalise")}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">{t("picks.basedOnHistory")}</span>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {picks.map(({ book, reason }) => (
          <Link key={book.id} href={`/books/${book.id}`} className="group flex gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40">
            <BookCover title={book.title} author={book.author} coverUrl={book.coverUrl} size="sm" className="w-16 shrink-0" />
            <div className="min-w-0 space-y-1.5">
              <p className="line-clamp-1 font-medium group-hover:text-primary">{book.title}</p>
              <p className="text-xs text-muted-foreground">{book.author}</p>
              <p className="line-clamp-3 text-sm text-muted-foreground">{reason}</p>
              <AvailabilityBadge book={book} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
