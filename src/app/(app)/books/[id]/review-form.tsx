"use client";

import { useState, useTransition } from "react";
import { Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveReview } from "@/lib/actions/misc";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";

export function ReviewForm({ bookId, existing }: { bookId: string; existing: { rating: number; body: string } | null }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState(existing?.body ?? "");
  const [open, setOpen] = useState(!existing);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {t("reviews.edit")}
      </Button>
    );
  }

  return (
    <form
      className="space-y-3 rounded-xl border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveReview({ bookId, rating, body });
          if (res.ok) {
            toast.success(res.message);
            setOpen(false);
          } else toast.error(res.error);
        });
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{existing ? t("reviews.yours") : t("reviews.rate")}</p>
        <div className="flex" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label={t("bookFields.rating")}>
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={rating === i}
              aria-label={t("reviews.stars", { count: i })}
              onMouseEnter={() => setHover(i)}
              onClick={() => setRating(i)}
              className="p-0.5"
            >
              <Star className={cn("size-5 transition-colors", i <= (hover || rating) ? "fill-warning text-warning" : "text-muted-foreground/40")} />
            </button>
          ))}
        </div>
      </div>
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("reviews.placeholder")} rows={3} />
      <div className="flex justify-end gap-2">
        {existing && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
        )}
        <Button type="submit" size="sm" disabled={pending || rating === 0}>
          {pending && <Loader2 className="animate-spin" />} {existing ? t("reviews.update") : t("reviews.post")}
        </Button>
      </div>
    </form>
  );
}
