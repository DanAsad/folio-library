"use client";

import { parseISO } from "date-fns";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useI18n } from "@/i18n/client";
import type { Translator } from "@/i18n";

type Period = { period: string; loans: number; late: number; finesCents: number };

const label = ({ date }: Translator, bucket: "week" | "month") => (v: string) => date(parseISO(v), bucket === "month" ? "monthYear" : "short");

/** Loans started per period, split by whether they came back (or are) late. */
export function CirculationChart({ data, bucket }: { data: Period[]; bucket: "week" | "month" }) {
  const i18n = useI18n();
  const { t, date } = i18n;
  const circulationConfig = {
    onTime: { label: t("reports.onTime"), color: "var(--chart-1)" },
    late: { label: t("reports.late"), color: "var(--chart-4)" },
  } satisfies ChartConfig;
  const rows = data.map((d) => ({ period: d.period, onTime: d.loans - d.late, late: d.late }));
  return (
    <ChartContainer config={circulationConfig} className="aspect-auto h-64 w-full">
      <BarChart data={rows} margin={{ left: -20, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={label(i18n, bucket)} minTickGap={16} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <ChartTooltip
          content={<ChartTooltipContent labelFormatter={(v) => (bucket === "month" ? date(parseISO(String(v)), "monthYear") : t("charts.weekOf", { date: parseISO(String(v)) }))} />}
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="onTime" stackId="a" fill="var(--color-onTime)" />
        <Bar dataKey="late" stackId="a" fill="var(--color-late)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

export function FinesChart({ data, bucket, currency }: { data: Period[]; bucket: "week" | "month"; currency: string }) {
  const i18n = useI18n();
  const finesConfig = { fines: { label: i18n.t("reports.finesCharged"), color: "var(--chart-2)" } } satisfies ChartConfig;
  const fmt = new Intl.NumberFormat(i18n.tag, { style: "currency", currency });
  const rows = data.map((d) => ({ period: d.period, fines: d.finesCents / 100 }));
  return (
    <ChartContainer config={finesConfig} className="aspect-auto h-64 w-full">
      <BarChart data={rows} margin={{ left: -8, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="period" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={label(i18n, bucket)} minTickGap={16} />
        <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(v) => fmt.format(v)} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => fmt.format(Number(v))} />} />
        <Bar dataKey="fines" fill="var(--color-fines)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
