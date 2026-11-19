import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Avail = { available: number; totalCopies: number; waitingHolds: number; readyHolds?: number };

export function AvailabilityBadge({ book, className, long }: { book: Avail; className?: string; long?: boolean }) {
  const { available, totalCopies, waitingHolds } = book;
  let tone: "ok" | "low" | "out";
  let label: string;
  if (available > 0) {
    tone = available === 1 && totalCopies > 1 ? "low" : "ok";
    label = long ? `${available} of ${totalCopies} available` : totalCopies > 1 ? `${available} available` : "Available";
  } else {
    tone = "out";
    label = waitingHolds > 0 ? `On loan · ${waitingHolds} waiting` : (book.readyHolds ?? 0) > 0 ? "Reserved" : "On loan";
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tone === "ok" && "bg-success/12 text-success",
        tone === "low" && "bg-warning/15 text-[color-mix(in_oklch,var(--warning),black_25%)] dark:text-warning",
        tone === "out" && "bg-muted text-muted-foreground",
        className,
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "ok" && "bg-success",
          tone === "low" && "bg-warning",
          tone === "out" && "bg-muted-foreground/60",
        )}
      />
      {label}
    </span>
  );
}

export function Stars({ value, count, size = "sm" }: { value: number | null; count?: number; size?: "sm" | "md" }) {
  if (value === null) return <span className="text-xs text-muted-foreground">No ratings yet</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" aria-label={`Rated ${value} out of 5`}>
      <span className="flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={cn(
              size === "md" ? "size-4" : "size-3",
              i <= Math.round(value) ? "fill-warning text-warning" : "text-muted-foreground/30",
            )}
          />
        ))}
      </span>
      <span className="tabular-nums">{value.toFixed(1)}</span>
      {count !== undefined && <span>({count})</span>}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/50 px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
