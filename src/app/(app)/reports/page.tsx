import Link from "next/link";
import { format } from "date-fns";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/books/bits";
import { GenreChart } from "../dashboard/charts";
import { formatMoney } from "@/lib/money";
import { requirePermissionPage } from "@/lib/session";
import { getReport, REPORT_RANGES, type ReportRange } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { CirculationChart, FinesChart } from "./report-charts";

export const metadata = { title: "Reports" };

const RANGE_LABEL: Record<ReportRange, string> = { 30: "Last 30 days", 90: "Last 90 days", 365: "Last 12 months" };

function Kpi({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "danger" }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-heading text-2xl font-semibold tabular-nums", tone === "danger" && "text-destructive")}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const user = await requirePermissionPage("reports:view");
  const lib = user.library;
  const requested = Number((await searchParams).range);
  const days: ReportRange = (REPORT_RANGES as readonly number[]).includes(requested) ? (requested as ReportRange) : 90;
  const r = await getReport(lib.id, days);
  const m = (c: number) => formatMoney(c, lib.currency);
  const s = r.summary;
  const exportHref = (type: string) => `/api/reports/export?type=${type}&range=${days}`;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Reports"
        description={`${lib.name}, ${format(r.since, "MMM d, yyyy")} to today.`}
        actions={
          <div className="flex rounded-lg border bg-card p-1 text-sm">
            {REPORT_RANGES.map((d) => (
              <Link
                key={d}
                href={`/reports?range=${d}`}
                className={cn("rounded-md px-3 py-1.5 font-medium", d === days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {RANGE_LABEL[d]}
              </Link>
            ))}
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Loans" value={s.loans} hint={`${s.titlesBorrowed} titles, ${s.borrowers} borrowers`} />
        <Kpi label="Returned late" value={`${s.lateRate}%`} hint={`${s.lateReturns} of ${s.returns} returns`} tone={s.lateRate > 25 ? "danger" : undefined} />
        <Kpi label="Average loan" value={`${s.avgLoanDays} days`} hint={`Loan period is ${lib.loanDays} days`} />
        <Kpi label="New members" value={s.newMembers} />
        <Kpi label="Fines charged" value={m(s.finesCharged)} />
        <Kpi label="Fines collected" value={m(s.finesCollected)} hint={s.finesWaived ? `${m(s.finesWaived)} waived` : undefined} />
        <Kpi label="Outstanding now" value={m(s.finesOutstanding)} tone={s.finesOutstanding ? "danger" : undefined} />
        <Kpi
          label="Copies in circulation"
          value={r.collection.active}
          hint={[r.collection.lost && `${r.collection.lost} lost`, r.collection.withdrawn && `${r.collection.withdrawn} withdrawn`].filter(Boolean).join(", ") || undefined}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Circulation</CardTitle>
            <CardDescription>Loans started per {r.bucket}, and how many ran late</CardDescription>
          </CardHeader>
          <CardContent>
            <CirculationChart data={r.periods} bucket={r.bucket as "week" | "month"} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Fines charged</CardTitle>
            <CardDescription>Late, lost and damage fees per {r.bucket}</CardDescription>
          </CardHeader>
          <CardContent>
            <FinesChart data={r.periods} bucket={r.bucket as "week" | "month"} currency={lib.currency} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Genres</CardTitle>
            <CardDescription>Share of loans</CardDescription>
          </CardHeader>
          <CardContent>{r.genres.length ? <GenreChart data={r.genres} /> : <p className="text-sm text-muted-foreground">No loans in this period.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Most borrowed</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm">
              {r.topBooks.map((b, i) => (
                <li key={b.id} className="flex items-center gap-3">
                  <span className="w-4 text-muted-foreground tabular-nums">{i + 1}</span>
                  <Link href={`/books/${b.id}`} className="min-w-0 flex-1 truncate hover:text-primary">
                    {b.title}
                  </Link>
                  <span className="text-muted-foreground tabular-nums">{b.loans}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Most active readers</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm">
              {r.topMembers.map((u, i) => (
                <li key={u.id} className="flex items-center gap-3">
                  <span className="w-4 text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{u.name}</span>
                  <span className="text-muted-foreground tabular-nums">{u.loans}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Condition of the collection</CardTitle>
            <CardDescription>Copies in circulation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {r.collection.byCondition.map((c) => (
              <div key={c.condition} className="flex items-center gap-3 text-sm">
                <span className="w-16 capitalize">{c.condition}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn("block h-full rounded-full", c.condition === "damaged" || c.condition === "poor" ? "bg-destructive/70" : "bg-primary")}
                    style={{ width: `${r.collection.active ? (c.n / r.collection.active) * 100 : 0}%` }}
                  />
                </span>
                <span className="w-8 text-right text-muted-foreground tabular-nums">{c.n}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Export</CardTitle>
            <CardDescription>CSV files for spreadsheets or a board report, for the period above.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href={exportHref("summary")}>
                <Download /> Summary by {r.bucket}
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={exportHref("loans")}>
                <Download /> Every loan
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={exportHref("fines")}>
                <Download /> Fines
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
