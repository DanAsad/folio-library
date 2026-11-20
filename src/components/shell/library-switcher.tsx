"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, Check, ChevronsUpDown, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { switchLibrary } from "@/lib/actions/library";
import { can } from "@/lib/permissions";
import { useI18n } from "@/i18n/client";
import type { CurrentUser } from "@/lib/session";

/** Shows the current library and lets people who belong to several switch between them. */
export function LibrarySwitcher({ user, onNavigate }: { user: CurrentUser; onNavigate?: () => void }) {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const choose = (id: string) => {
    if (id === user.library.id) return;
    start(async () => {
      const res = await switchLibrary(id);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      onNavigate?.();
      router.push("/dashboard");
      router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg border bg-card/70 px-3 py-2 text-left transition-colors hover:border-primary/30"
          aria-label={t("shell.switchLibrary")}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Building2 className="size-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.library.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{t(`roles.${user.role}`)}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{t("shell.yourLibraries")}</DropdownMenuLabel>
        {user.libraries.map((l) => (
          <DropdownMenuItem key={l.id} onSelect={() => choose(l.id)} className="items-start gap-2">
            <Check className={l.id === user.library.id ? "mt-0.5 opacity-100" : "mt-0.5 opacity-0"} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{l.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {t(`roles.${l.role}`)}
                {l.tagline ? ` · ${l.tagline}` : ""}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
        {can(user.role, "settings:manage") && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings#new-library" onClick={onNavigate}>
                <Settings2 /> {t("shell.settingsAndNew")}
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
