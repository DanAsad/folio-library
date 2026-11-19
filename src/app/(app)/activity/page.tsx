import Link from "next/link";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { format, isToday, isYesterday } from "date-fns";
import { Archive, BellRing, BookCheck, BookCopy, BookPlus, BookUp, Building2, HandCoins, Pencil, Receipt, RefreshCw, SearchX, Settings, ShieldCheck, Trash2, Upload, UserPlus, XCircle, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/books/bits";
import { getDb } from "@/lib/db/client";
import { activity } from "@/lib/db/schema";
import { requirePermissionPage } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata = { title: "Activity log" };

const ICONS: Record<string, LucideIcon> = {
  "loan.borrow": BookUp,
  "loan.return": BookCheck,
  "loan.renew": RefreshCw,
  "hold.place": BellRing,
  "hold.ready": BellRing,
  "book.create": BookPlus,
  "book.update": Pencil,
  "book.delete": Trash2,
  "book.import": Upload,
  "user.join": UserPlus,
  "user.role": ShieldCheck,
  "copy.add": BookCopy,
  "copy.update": Archive,
  "copy.lost": SearchX,
  "fine.add": Receipt,
  "fine.paid": HandCoins,
  "fine.waived": XCircle,
  "library.settings": Settings,
  "library.create": Building2,
};

const FILTERS = [
  ["", "Everything"],
  ["loan", "Loans"],
  ["hold", "Waitlists"],
  ["book", "Catalogue"],
  ["copy", "Copies"],
  ["fine", "Fines"],
  ["user", "Members"],
] as const;

const PAGE = 60;

export default async function ActivityPage({ searchParams }: PageProps<"/activity">) {
  const user = await requirePermissionPage("activity:view");
  const sp = await searchParams;
  const type = typeof sp.type === "string" && FILTERS.some(([k]) => k === sp.type) ? sp.type : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const db = await getDb();
  const where = and(eq(activity.libraryId, user.library.id), type ? like(activity.action, `${type}.%`) : undefined);
  const [rows, [{ total }]] = await Promise.all([
    db.query.activity.findMany({ where, orderBy: desc(activity.createdAt), limit: PAGE, offset: (page - 1) * PAGE }),
    db.select({ total: sql<number>`count(*)::int` }).from(activity).where(where),
  ]);

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const label = isToday(r.createdAt) ? "Today" : isYesterday(r.createdAt) ? "Yesterday" : format(r.createdAt, "EEEE, MMMM d");
    groups.set(label, [...(groups.get(label) ?? []), r]);
  }
  const qs = (p: number) => `/activity?${new URLSearchParams({ ...(type && { type }), page: String(p) })}`;

  return (
    <>
      <PageHeader title="Activity log" description={`An audit trail of every loan, return, fine, copy and catalogue change at ${user.library.name}.`} />
      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        {FILTERS.map(([k, label]) => (
          <Link key={k} href={k ? `/activity?type=${k}` : "/activity"} className={cn("rounded-full border px-3 py-1", type === k && "border-primary bg-accent text-accent-foreground")}>
            {label}
          </Link>
        ))}
      </div>

      <div className="space-y-8">
        {[...groups.entries()].map(([label, items]) => (
          <section key={label}>
            <h2 className="mb-3 font-sans text-xs font-semibold tracking-wider text-muted-foreground uppercase">{label}</h2>
            <ol className="relative space-y-1 border-l pl-6">
              {items.map((a) => {
                const Icon = ICONS[a.action] ?? Pencil;
                return (
                  <li key={a.id} className="relative py-2">
                    <span className="absolute top-2.5 -left-[2.1rem] flex size-6 items-center justify-center rounded-full border bg-card">
                      <Icon className="size-3 text-primary" />
                    </span>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                      {a.bookId ? (
                        <Link href={`/books/${a.bookId}`} className="text-sm hover:text-primary">
                          {a.message}
                        </Link>
                      ) : (
                        <p className="text-sm">{a.message}</p>
                      )}
                      <time className="text-xs text-muted-foreground tabular-nums">{format(a.createdAt, "h:mm a")}</time>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, total)} of {total}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={qs(page - 1)} className="rounded-md border px-3 py-1 hover:bg-muted">
              Newer
            </Link>
          )}
          {page * PAGE < total && (
            <Link href={qs(page + 1)} className="rounded-md border px-3 py-1 hover:bg-muted">
              Older
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
