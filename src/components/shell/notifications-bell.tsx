"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, BellRing, CalendarClock, CheckCheck, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { markNotificationsRead, switchLibrary } from "@/lib/actions/library";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";

export type NotificationItem = {
  id: string;
  kind: "due_soon" | "overdue" | "hold_ready" | "fine";
  title: string;
  body: string;
  href: string | null;
  library: string;
  libraryId: string;
  read: boolean;
  createdAt: string;
};

const ICON = { due_soon: CalendarClock, overdue: AlertTriangle, hold_ready: BellRing, fine: Receipt };
const TONE = { due_soon: "text-warning", overdue: "text-destructive", hold_ready: "text-success", fine: "text-primary" };

export function NotificationsBell({
  items,
  unread,
  multiLibrary,
  currentLibraryId,
}: {
  items: NotificationItem[];
  unread: number;
  multiLibrary: boolean;
  currentLibraryId: string;
}) {
  const router = useRouter();
  const { t, relative } = useI18n();
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();

  const read = (ids?: string[]) =>
    start(async () => {
      await markNotificationsRead(ids);
      router.refresh();
    });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread ? t("notifications.ariaUnread", { count: unread }) : t("notifications.title")}>
          <Bell />
          {unread > 0 && (
            <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.6rem] leading-4 font-semibold text-white tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-medium">{t("notifications.title")}</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => read()}>
              <CheckCheck /> {t("notifications.markAllRead")}
            </Button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("notifications.empty")}</p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
            {items.map((n) => {
              const Icon = ICON[n.kind];
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    className={cn("flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60", !n.read && "bg-accent/40")}
                    onClick={() => {
                      setOpen(false);
                      start(async () => {
                        if (!n.read) await markNotificationsRead([n.id]);
                        // Links point into the library the notice came from.
                        if (n.libraryId !== currentLibraryId) await switchLibrary(n.libraryId);
                        if (n.href) router.push(n.href);
                        router.refresh();
                      });
                    }}
                  >
                    <Icon className={cn("mt-0.5 size-4 shrink-0", TONE[n.kind])} />
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="block text-sm font-medium">{n.title}</span>
                      <span className="block text-xs text-muted-foreground">{n.body}</span>
                      <span className="block text-[0.7rem] text-muted-foreground">
                        {relative(n.createdAt)}
                        {multiLibrary ? ` · ${n.library}` : ""}
                      </span>
                    </span>
                    {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label={t("notifications.unread")} />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
