"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { BookOpen, Moon, Plus, Search, Sparkles } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { navFor } from "@/components/shell/nav";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/lib/session";

type Hit = { id: string; title: string; author: string; available: number };

export function useCommandMenu() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

export function CommandMenu({ open, setOpen, user }: { open: boolean; setOpen: (o: boolean) => void; user: CurrentUser }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/books/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then(setHits)
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Search" description="Search books or jump to a page">
      <CommandInput placeholder="Search books, authors, ISBN, or type a command…" value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No matches. Press Enter to ask the AI librarian.</CommandEmpty>
        {query.trim() && hits.length > 0 && (
          <CommandGroup heading="Books">
            {hits.map((b) => (
              <CommandItem key={b.id} value={`book-${b.id}-${b.title}-${b.author}`} onSelect={() => go(`/books/${b.id}`)}>
                <BookOpen />
                <span className="truncate">
                  {b.title} <span className="text-muted-foreground">· {b.author}</span>
                </span>
                <span className={`ml-auto text-xs ${b.available ? "text-success" : "text-muted-foreground"}`}>
                  {b.available ? "Available" : "On loan"}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {query.trim() && (
          <CommandGroup heading="Search">
            <CommandItem value={`search-all-${query}`} onSelect={() => go(`/books?q=${encodeURIComponent(query)}`)}>
              <Search /> Search the catalogue for “{query}”
            </CommandItem>
            <CommandItem value={`ai-search-${query}`} onSelect={() => go(`/books?ai=1&q=${encodeURIComponent(query)}`)}>
              <Sparkles /> Smart search: “{query}”
            </CommandItem>
            <CommandItem value={`ask-${query}`} onSelect={() => go(`/assistant?q=${encodeURIComponent(query)}`)}>
              <Sparkles /> Ask the Librarian: “{query}”
            </CommandItem>
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading="Go to">
          {navFor(user.role).map((n) => (
            <CommandItem key={n.href} value={`nav-${n.label}`} onSelect={() => go(n.href)}>
              {n.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Actions">
          {can(user.role, "books:manage") && (
            <CommandItem value="action-add-book" onSelect={() => go("/books/new")}>
              <Plus /> Add a book
            </CommandItem>
          )}
          <CommandItem
            value="action-theme"
            onSelect={() => {
              setTheme(resolvedTheme === "dark" ? "light" : "dark");
              setOpen(false);
            }}
          >
            <Moon /> Toggle dark mode
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
