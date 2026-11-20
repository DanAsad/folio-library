"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ScanBarcode, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BookCover } from "@/components/book-cover";
import { BarcodeScannerDialog } from "@/components/barcode-scanner";
import { createBook, updateBook } from "@/lib/actions/books";
import { generateCatalogueEntry } from "@/lib/ai-client";
import { aiErrorMessage } from "@/lib/ai-messages";
import { useI18n } from "@/i18n/client";
import type { BookInput } from "@/lib/validation";

export type BookFormValues = {
  title: string;
  author: string;
  isbn: string;
  genre: string;
  tags: string;
  publishedYear: string;
  publisher: string;
  pages: string;
  language: string;
  description: string;
  coverUrl: string;
  copies: string;
  location: string;
};

export const EMPTY_BOOK: BookFormValues = {
  title: "",
  author: "",
  isbn: "",
  genre: "",
  tags: "",
  publishedYear: "",
  publisher: "",
  pages: "",
  language: "English",
  description: "",
  coverUrl: "",
  copies: "1",
  location: "",
};

export function BookForm({
  bookId,
  initial,
  genres,
  aiAvailable,
}: {
  bookId?: string;
  initial: BookFormValues;
  genres: string[];
  aiAvailable: boolean;
}) {
  const router = useRouter();
  const i18n = useI18n();
  const { t } = i18n;
  const [v, setV] = useState(initial);
  const [saving, startSave] = useTransition();
  const [filling, setFilling] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [filled, setFilled] = useState<Set<string>>(new Set());

  const set = (k: keyof BookFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));

  const autofill = async (override?: Partial<BookFormValues>) => {
    const src = { ...v, ...override };
    if (!src.isbn && !src.title) {
      toast.error(t("bookForm.needIsbn"));
      return;
    }
    setFilling(true);
    try {
      const res = await fetch("/api/books/autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isbn: src.isbn || undefined, title: src.title || undefined, author: src.author || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(t("bookForm.autofillFailed"));
        return;
      }

      const merged = { ...src };
      const changed = new Set<string>();
      const fill = (k: keyof BookFormValues, value: unknown) => {
        if (value === undefined || value === null || value === "") return;
        // Only fill blanks, so we never overwrite something the librarian typed.
        if (merged[k] && !(k === "language" && merged[k] === "English")) return;
        merged[k] = Array.isArray(value) ? value.join(", ") : String(value);
        changed.add(k);
      };

      // Step 1: facts from Open Library.
      fill("title", data.title);
      fill("author", data.author);
      fill("isbn", data.isbn);
      fill("publisher", data.publisher);
      fill("publishedYear", data.publishedYear);
      fill("pages", data.pages);
      fill("coverUrl", data.coverUrl);
      setV({ ...merged });
      setFilled(new Set(changed));
      if (data.found) toast.success(t("bookForm.filled", { count: changed.size }));

      // Step 2: blurb, genre and tags from the free AI (runs in this browser).
      if (aiAvailable && merged.title && merged.author) {
        const before = changed.size;
        try {
          const ai = await generateCatalogueEntry(
            { title: merged.title, author: merged.author, isbn: merged.isbn, notes: [data.publisher, data.publishedYear, data.subjects?.join(", ")].filter(Boolean).join(" · ") },
            genres,
          );
          fill("description", ai.description);
          fill("genre", ai.genre);
          fill("tags", ai.tags);
          fill("publishedYear", ai.publishedYear);
          fill("language", ai.language);
          setV({ ...merged });
          setFilled(new Set(changed));
          toast.success(t("bookForm.aiFilled", { count: changed.size - before }), { description: t("bookForm.aiReview") });
        } catch (err) {
          if (!data.found) toast.error(t("bookForm.notFound"));
          else toast.info(aiErrorMessage(i18n, err, "bookForm.aiFailed"));
        }
      } else if (!data.found) {
        toast.error(t("bookForm.notFoundOl"));
      }
    } catch {
      toast.error(t("bookForm.offline"));
    } finally {
      setFilling(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input: BookInput = { ...v };
    startSave(async () => {
      const res = bookId ? await updateBook(bookId, input) : await createBook(input);
      if (res.ok) {
        toast.success(res.message);
        router.push(`/books/${res.data?.id ?? bookId}`);
      } else toast.error(res.error);
    });
  };

  const hl = (k: string) => (filled.has(k) ? "ring-2 ring-primary/30 bg-accent/30" : "");

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="size-4 text-primary" /> {t("bookForm.quickAdd")}
            </CardTitle>
            <CardDescription>{aiAvailable ? t("bookForm.quickAddAi") : t("bookForm.quickAddHint")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row">
            <Input value={v.isbn} onChange={set("isbn")} placeholder={t("bookForm.isbnPlaceholder")} className={`font-mono ${hl("isbn")}`} inputMode="numeric" />
            <Button type="button" variant="outline" onClick={() => setScanOpen(true)}>
              <ScanBarcode /> {t("bookForm.scan")}
            </Button>
            <Button type="button" onClick={() => autofill()} disabled={filling}>
              {filling ? <Loader2 className="animate-spin" /> : <Sparkles />} {t("bookForm.autofill")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label={t("bookFields.title")} required className="sm:col-span-2">
              <Input value={v.title} onChange={set("title")} required className={hl("title")} />
            </Field>
            <Field label={t("bookFields.author")} required className="sm:col-span-2">
              <Input value={v.author} onChange={set("author")} required className={hl("author")} />
            </Field>
            <Field label={t("bookFields.genre")}>
              <Input value={v.genre} onChange={set("genre")} list="genre-options" className={hl("genre")} />
              <datalist id="genre-options">
                {genres.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </Field>
            <Field label={t("bookFields.tags")} hint={t("bookForm.commaSeparated")}>
              <Input value={v.tags} onChange={set("tags")} placeholder={t("bookForm.tagsPlaceholder")} className={hl("tags")} />
            </Field>
            <Field label={t("bookForm.year")}>
              <Input value={v.publishedYear} onChange={set("publishedYear")} inputMode="numeric" className={hl("publishedYear")} />
            </Field>
            <Field label={t("bookFields.publisher")}>
              <Input value={v.publisher} onChange={set("publisher")} className={hl("publisher")} />
            </Field>
            <Field label={t("bookFields.pages")}>
              <Input value={v.pages} onChange={set("pages")} inputMode="numeric" className={hl("pages")} />
            </Field>
            <Field label={t("bookFields.language")}>
              <Input value={v.language} onChange={set("language")} className={hl("language")} />
            </Field>
            <Field label={t("bookFields.description")} className="sm:col-span-2">
              <Textarea value={v.description} onChange={set("description")} rows={5} className={hl("description")} />
            </Field>
            <Field label={t("bookFields.coverUrl")} className="sm:col-span-2">
              <Input value={v.coverUrl} onChange={set("coverUrl")} placeholder="https://…" className={hl("coverUrl")} />
            </Field>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <BookCover title={v.title || t("bookForm.untitled")} author={v.author || t("bookForm.unknownAuthor")} coverUrl={v.coverUrl} size="lg" className="mx-auto w-48 lg:w-full" key={v.coverUrl} />
        <Card>
          <CardContent className="grid gap-4">
            {bookId ? (
              <p className="text-sm text-muted-foreground">{t("bookForm.copiesOnBookPage")}</p>
            ) : (
              <Field label={t("bookFields.copies")} required hint={t("bookForm.copiesHint")}>
                <Input type="number" min={1} max={50} value={v.copies} onChange={set("copies")} required />
              </Field>
            )}
            <Field label={t("bookFields.location")} hint={t("bookForm.locationHint")}>
              <Input value={v.location} onChange={set("location")} className="font-mono" />
            </Field>
          </CardContent>
        </Card>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={() => router.back()}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" className="flex-1" disabled={saving}>
            {saving && <Loader2 className="animate-spin" />} {bookId ? t("bookForm.saveChanges") : t("shell.addBook")}
          </Button>
        </div>
      </div>

      <BarcodeScannerDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onDetected={(isbn) => {
          setScanOpen(false);
          autofill({ isbn });
        }}
      />
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label className="flex items-baseline justify-between">
        <span>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </span>
        {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
      </Label>
      {children}
    </div>
  );
}
