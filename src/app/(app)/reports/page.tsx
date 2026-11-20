import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/books/bits";
import { GenreChart } from "../dashboard/charts";
import { requirePermissionPage } from "@/lib/session";
import { getReport, REPORT_RANGES, type ReportRange } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { CirculationChart, FinesChart } from "./report-charts";
import { getI18n } from "@/i18n/server";
import type { MessageKey } from "@/i18n";

export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("nav.reports") };
}

const RANGE_LABEL: Record<ReportRange, MessageKey> = { 30: "reports.last30", 90: "reports.last90", 365: "reports.last365" };

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
  const { t, date, money } = await getI18n();
  const m = (c: number) => money(c, lib.currency);
  const per = r.bucket === "month" ? t("reports.perMonth") : t("reports.perWeek");
  const s = r.summary;
  const exportHref = (type: string) => `/api/reports/export?type=${type}&range=${days}`;

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("nav.reports")}
        description={t("reports.description", { library: lib.name, date: date(r.since, "medium") })}
        actions={
          <div className="flex rounded-lg border bg-card p-1 text-sm">
            {REPORT_RANGES.map((d) => (
              <Link
                key={d}
                href={`/reports?range=${d}`}
                className={cn("rounded-md px-3 py-1.5 font-medium", d === days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {t(RANGE_LABEL[d])}
              </Link>
            ))}
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label={t("charts.loans")} value={s.loans} hint={t("reports.loansHint", { titles: s.titlesBorrowed, borrowers: s.borrowers })} />
        <Kpi
          label={t("reports.returnedLate")}
          value={`${s.lateRate}%`}
          hint={t("reports.lateHint", { late: s.lateReturns, returns: s.returns })}
          tone={s.lateRate > 25 ? "danger" : undefined}
        />
        <Kpi label={t("reports.avgLoan")} value={t("reports.days", { count: s.avgLoanDays })} hint={t("reports.loanPeriod", { count: lib.loanDays })} />
        <Kpi label={t("reports.newMembers")} value={s.newMembers} />
        <Kpi label={t("reports.finesCharged")} value={m(s.finesCharged)} />
        <Kpi label={t("reports.finesCollected")} value={m(s.finesCollected)} hint={s.finesWaived ? t("reports.waived", { amount: m(s.finesWaived) }) : undefined} />
        <Kpi label={t("reports.outstanding")} value={m(s.finesOutstanding)} tone={s.finesOutstanding ? "danger" : undefined} />
        <Kpi
          label={t("reports.inCirculation")}
          value={r.collection.active}
          hint={
            [r.collection.lost && t("reports.lostCount", { count: r.collection.lost }), r.collection.withdrawn && t("reports.withdrawnCount", { count: r.collection.withdrawn })]
              .filter(Boolean)
              .join(", ") || undefined
          }
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("reports.circulation")}</CardTitle>
            <CardDescription>{t("reports.circulationHint", { per })}</CardDescription>
          </CardHeader>
          <CardContent>
            <CirculationChart data={r.periods} bucket={r.bucket as "week" | "month"} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("reports.finesCharged")}</CardTitle>
            <CardDescription>{t("reports.finesHint", { per })}</CardDescription>
          </CardHeader>
          <CardContent>
            <FinesChart data={r.periods} bucket={r.bucket as "week" | "month"} currency={lib.currency} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("reports.genres")}</CardTitle>
            <CardDescription>{t("reports.shareOfLoans")}</CardDescription>
          </CardHeader>
          <CardContent>{r.genres.length ? <GenreChart data={r.genres} /> : <p className="text-sm text-muted-foreground">{t("reports.noLoans")}</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.mostBorrowed")}</CardTitle>
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
            <CardTitle>{t("reports.activeReaders")}</CardTitle>
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
            <CardTitle>{t("reports.condition")}</CardTitle>
            <CardDescription>{t("reports.inCirculation")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {r.collection.byCondition.map((c) => (
              <div key={c.condition} className="flex items-center gap-3 text-sm">
                <span className="w-20">{t(`conditions.${c.condition as "new" | "good" | "fair" | "poor" | "damaged"}`)}</span>
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
            <CardTitle>{t("reports.export")}</CardTitle>
            <CardDescription>{t("reports.exportHint")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href={exportHref("summary")}>
                <Download /> {r.bucket === "month" ? t("reports.summaryMonth") : t("reports.summaryWeek")}
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={exportHref("loans")}>
                <Download /> {t("reports.everyLoan")}
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={exportHref("fines")}>
                <Download /> {t("loansPage.fines")}
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
