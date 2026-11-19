"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutGrid, List, Loader2, ScanBarcode, Search, Sparkles, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { BarcodeScannerDialog } from "@/components/barcode-scanner";
import { AiError, interpretSearch } from "@/lib/ai-client";
import { cn } from "@/lib/utils";

const FIELDS = [
  ["all", "All fields"],
  ["title", "Title"],
  ["author", "Author"],
  ["isbn", "ISBN"],
  ["genre", "Genre"],
  ["tags", "Tags"],
  ["publisher", "Publisher"],
] as const;

const SORT_LABELS = [
  ["relevance", "Best match"],
  ["title", "Title A–Z"],
  ["author", "Author A–Z"],
  ["popular", "Most borrowed"],
  ["rating", "Highest rated"],
  ["year", "Publication year"],
  ["newest", "Recently added"],
] as const;

export function CatalogToolbar({ genres, aiAvailable }: { genres: string[]; aiAvailable: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [navPending, startTransition] = useTransition();
  const [aiPending, startAi] = useTransition();
  const pending = navPending || aiPending;
  const [q, setQ] = useState(params.get("q") ?? "");
  const [scanOpen, setScanOpen] = useState(false);
  const ai = params.get("ai") === "1";
  const first = useRef(true);
  const autoRan = useRef(false);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "" || v === "all") next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };

  const AI_PARAMS = { why: null, kw: null, from: null, to: null } as const;

  /** Smart search: the visitor's browser asks the free AI to turn the request into filters. */
  const runSmart = (text: string) => {
    const query = text.trim();
    if (!query) return;
    startAi(async () => {
      try {
        const plan = await interpretSearch(query, genres);
        update({
          ai: "1",
          q: query,
          field: null,
          why: plan.explanation,
          kw: plan.keywords,
          genre: plan.genre,
          from: plan.yearFrom ? String(plan.yearFrom) : null,
          to: plan.yearTo ? String(plan.yearTo) : null,
          available: plan.availableOnly ? "1" : null,
          sort: plan.sort === "relevance" ? null : plan.sort,
        });
      } catch (err) {
        toast.error(err instanceof AiError ? err.message : "Smart search failed.", { description: "Showing plain keyword results instead." });
        update({ ai: "1", q: query, ...AI_PARAMS });
      }
    });
  };

  // Links like /books?ai=1&q=… (from the Ctrl+K menu) arrive without an interpretation yet.
  useEffect(() => {
    if (!autoRan.current && ai && q && !params.get("why") && aiAvailable) {
      autoRan.current = true;
      runSmart(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Instant keyword search (debounced). Smart search waits for Enter, since it calls the AI.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (ai) return;
    const t = setTimeout(() => update({ q }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="space-y-3">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (ai) runSmart(q);
          else update({ q });
        }}
      >
        <div
          className={cn(
            "flex flex-1 items-center gap-2 rounded-lg border bg-card pl-3 transition-shadow focus-within:ring-3 focus-within:ring-ring/30",
            ai && "border-primary/40 bg-accent/40",
          )}
        >
          {pending ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : ai ? (
            <Sparkles className="size-4 shrink-0 text-primary" />
          ) : (
            <Search className="size-4 shrink-0 text-muted-foreground" />
          )}
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={ai ? "Describe what you're after, e.g. “short sci-fi from the 90s I can borrow today”" : "Search by title, author, ISBN, genre or tag…"}
            className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
            aria-label="Search the catalogue"
          />
          {q && (
            <button type="button" aria-label="Clear search" className="text-muted-foreground hover:text-foreground" onClick={() => { setQ(""); update({ q: null }); }}>
              <X className="size-4" />
            </button>
          )}
          {!ai && (
            <Select value={params.get("field") ?? "all"} onValueChange={(v) => update({ field: v })}>
              <SelectTrigger className="h-8 w-[7.5rem] border-0 border-l bg-transparent shadow-none dark:bg-transparent" aria-label="Search field">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELDS.map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="mr-1" aria-label="Scan a barcode" onClick={() => setScanOpen(true)}>
                <ScanBarcode />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Scan a book&apos;s barcode</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={ai ? "default" : "outline"}
                className="h-10"
                disabled={!aiAvailable}
                onClick={() => (ai ? update({ ai: null, ...AI_PARAMS, genre: null, available: null, sort: null }) : update({ ai: "1" }))}
              >
                <Sparkles /> Smart search
              </Button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {aiAvailable ? "Describe what you want in plain English. AI turns it into filters (free, no account needed)." : "AI features are turned off on this deployment."}
            </TooltipContent>
          </Tooltip>
          {ai && (
            <Button type="submit" className="h-10" disabled={pending}>
              Search
            </Button>
          )}
        </div>
      </form>

      {aiPending && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-3.5 animate-spin" /> The AI is reading your request. The free service can take 10–20 seconds…
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Select value={params.get("genre") ?? "all"} onValueChange={(v) => update({ genre: v })}>
          <SelectTrigger className="h-8 w-44" aria-label="Genre">
            <SelectValue placeholder="All genres" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All genres</SelectItem>
            {genres.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={params.get("sort") ?? "relevance"} onValueChange={(v) => update({ sort: v === "relevance" ? null : v })}>
          <SelectTrigger className="h-8 w-44" aria-label="Sort by">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_LABELS.map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="available" checked={params.get("available") === "1"} onCheckedChange={(c) => update({ available: c ? "1" : null })} />
          <Label htmlFor="available" className="text-sm font-normal">
            Available now
          </Label>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          className="ml-auto"
          value={params.get("view") ?? "grid"}
          onValueChange={(v) => v && update({ view: v === "grid" ? null : v })}
        >
          <ToggleGroupItem value="grid" aria-label="Cover grid">
            <LayoutGrid />
          </ToggleGroupItem>
          <ToggleGroupItem value="table" aria-label="Table">
            <List />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <BarcodeScannerDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        onDetected={(code) => {
          setScanOpen(false);
          setQ(code);
          update({ q: code, field: "isbn", ai: null });
        }}
      />
    </div>
  );
}
