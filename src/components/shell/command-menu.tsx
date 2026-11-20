"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { BookOpen, Moon, Plus, Search, Sparkles } from "lucide-react";
import {
  Command,
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
import { useI18n } from "@/i18n/client";

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
  const { t } = useI18n();
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
    <CommandDialog open={open} onOpenChange={setOpen} title={t("command.title")} description={t("command.description")}>
      {/* The cmdk root must wrap the input and list; CommandDialog doesn't add it. */}
      <Command>
      <CommandInput placeholder={t("command.placeholder")} value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>{t("command.empty")}</CommandEmpty>
        {query.trim() && hits.length > 0 && (
          <CommandGroup heading={t("command.books")}>
            {hits.map((b) => (
              <CommandItem key={b.id} value={`book-${b.id}-${b.title}-${b.author}`}
                keywords={[query]} // the server already matched it (ISBN, tags, barcode…), so never hide it
                onSelect={() => go(`/books/${b.id}`)}>
                <BookOpen />
                <span className="truncate">
                  {b.title} <span className="text-muted-foreground">· {b.author}</span>
                </span>
                <span className={`ml-auto text-xs ${b.available ? "text-success" : "text-muted-foreground"}`}>
                  {b.available ? t("books.available") : t("books.onLoan")}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {query.trim() && (
          <CommandGroup heading={t("command.search")}>
            <CommandItem value={`search-all-${query}`} onSelect={() => go(`/books?q=${encodeURIComponent(query)}`)}>
              <Search /> {t("command.searchCatalogue", { query })}
            </CommandItem>
            <CommandItem value={`ai-search-${query}`} onSelect={() => go(`/books?ai=1&q=${encodeURIComponent(query)}`)}>
              <Sparkles /> {t("command.smartSearch", { query })}
            </CommandItem>
            <CommandItem value={`ask-${query}`} onSelect={() => go(`/assistant?q=${encodeURIComponent(query)}`)}>
              <Sparkles /> {t("command.askLibrarian", { query })}
            </CommandItem>
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading={t("command.goTo")}>
          {navFor(user.role).map((n) => (
            <CommandItem key={n.href} value={`nav-${n.href}-${t(n.label)}`} onSelect={() => go(n.href)}>
              {t(n.label)}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading={t("command.actions")}>
          {can(user.role, "books:manage") && (
            <CommandItem value="action-add-book" onSelect={() => go("/books/new")}>
              <Plus /> {t("command.addBook")}
            </CommandItem>
          )}
          <CommandItem
            value="action-theme"
            onSelect={() => {
              setTheme(resolvedTheme === "dark" ? "light" : "dark");
              setOpen(false);
            }}
          >
            <Moon /> {t("command.toggleTheme")}
          </CommandItem>
        </CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  );
}
