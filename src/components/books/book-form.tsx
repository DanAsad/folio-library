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
import { AiError, generateCatalogueEntry } from "@/lib/ai-client";
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
      toast.error("Enter an ISBN or a title first.");
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
        toast.error(data.error ?? "Couldn't auto-fill this book.");
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
      if (data.found) toast.success(`Filled ${changed.size} fields from Open Library`);

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
          toast.success(`AI wrote ${changed.size - before} more fields`, { description: "Description, genre and tags. Please review before saving." });
        } catch (err) {
          if (!data.found) toast.error("Couldn't find that book. Fill in the details manually.");
          else toast.info(err instanceof AiError ? err.message : "The AI couldn't write a description this time.");
        }
      } else if (!data.found) {
        toast.error("Couldn't find that book on Open Library. Fill in the details manually.");
      }
    } catch {
      toast.error("Auto-fill failed. Check your connection.");
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
              <Wand2 className="size-4 text-primary" /> Quick add
            </CardTitle>
            <CardDescription>
              Scan or type an ISBN (or a title and author), then auto-fill. Facts come from Open Library
              {aiAvailable ? "; free open-source AI writes the blurb, genre and tags." : "."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row">
            <Input value={v.isbn} onChange={set("isbn")} placeholder="ISBN, e.g. 9780441013593" className={`font-mono ${hl("isbn")}`} inputMode="numeric" />
            <Button type="button" variant="outline" onClick={() => setScanOpen(true)}>
              <ScanBarcode /> Scan
            </Button>
            <Button type="button" onClick={() => autofill()} disabled={filling}>
              {filling ? <Loader2 className="animate-spin" /> : <Sparkles />} Auto-fill details
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" required className="sm:col-span-2">
              <Input value={v.title} onChange={set("title")} required className={hl("title")} />
            </Field>
            <Field label="Author" required className="sm:col-span-2">
              <Input value={v.author} onChange={set("author")} required className={hl("author")} />
            </Field>
            <Field label="Genre">
              <Input value={v.genre} onChange={set("genre")} list="genre-options" className={hl("genre")} />
              <datalist id="genre-options">
                {genres.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </Field>
            <Field label="Tags" hint="Comma separated">
              <Input value={v.tags} onChange={set("tags")} placeholder="space opera, politics" className={hl("tags")} />
            </Field>
            <Field label="Publication year">
              <Input value={v.publishedYear} onChange={set("publishedYear")} inputMode="numeric" className={hl("publishedYear")} />
            </Field>
            <Field label="Publisher">
              <Input value={v.publisher} onChange={set("publisher")} className={hl("publisher")} />
            </Field>
            <Field label="Pages">
              <Input value={v.pages} onChange={set("pages")} inputMode="numeric" className={hl("pages")} />
            </Field>
            <Field label="Language">
              <Input value={v.language} onChange={set("language")} className={hl("language")} />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Textarea value={v.description} onChange={set("description")} rows={5} className={hl("description")} />
            </Field>
            <Field label="Cover image URL" className="sm:col-span-2">
              <Input value={v.coverUrl} onChange={set("coverUrl")} placeholder="https://…" className={hl("coverUrl")} />
            </Field>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <BookCover title={v.title || "Untitled"} author={v.author || "Unknown author"} coverUrl={v.coverUrl} size="lg" className="mx-auto w-48 lg:w-full" key={v.coverUrl} />
        <Card>
          <CardContent className="grid gap-4">
            {bookId ? (
              <p className="text-sm text-muted-foreground">Copies, barcodes and their condition are managed on the book page.</p>
            ) : (
              <Field label="Copies" required hint="Each gets its own barcode">
                <Input type="number" min={1} max={50} value={v.copies} onChange={set("copies")} required />
              </Field>
            )}
            <Field label="Shelf location" hint="e.g. SF-12">
              <Input value={v.location} onChange={set("location")} className="font-mono" />
            </Field>
          </CardContent>
        </Card>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="flex-1" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={saving}>
            {saving && <Loader2 className="animate-spin" />} {bookId ? "Save changes" : "Add book"}
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
