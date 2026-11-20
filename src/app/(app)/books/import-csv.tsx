"use client";

import { useRef, useState, useTransition } from "react";
import { FileUp, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { importBooksCsv } from "@/lib/actions/books";
import { useI18n } from "@/i18n/client";

const SAMPLE = `title,author,isbn,genre,year,copies,tags
The Left Hand of Darkness,Ursula K. Le Guin,9780441478125,Science Fiction,1969,1,gender;anthropology`;

export function ImportCsvButton() {
  const { t, rich } = useI18n();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const submit = () => {
    if (!file) return;
    start(async () => {
      const res = await importBooksCsv(await file.text());
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
        setFile(null);
      } else toast.error(res.error);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload /> {t("csv.import")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("csv.title")}</DialogTitle>
          <DialogDescription>
            {rich("csv.columns", { title: <code>title</code>, author: <code>author</code>, sep: <code>;</code> })}
          </DialogDescription>
        </DialogHeader>
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-sm text-muted-foreground hover:border-primary/40 hover:bg-accent/40"
        >
          <FileUp className="size-6" />
          {file ? <span className="font-medium text-foreground">{file.name}</span> : t("csv.choose")}
        </button>
        <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-[0.7rem] leading-relaxed">{SAMPLE}</pre>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={!file || pending}>
            {pending && <Loader2 className="animate-spin" />} {t("csv.importButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
