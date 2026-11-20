"use client";

import { parseISO } from "date-fns";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useI18n } from "@/i18n/client";

export function WeeklyLoansChart({ data }: { data: { week: string; loans: number }[] }) {
  const { t, date } = useI18n();
  const loansConfig = { loans: { label: t("charts.loans"), color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={loansConfig} className="aspect-auto h-56 w-full">
      <AreaChart data={data} margin={{ left: -20, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="fillLoans" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-loans)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-loans)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(v) => date(parseISO(v))} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => t("charts.weekOf", { date: parseISO(String(v)) })} />} />
        <Area dataKey="loans" type="monotone" stroke="var(--color-loans)" strokeWidth={2} fill="url(#fillLoans)" />
      </AreaChart>
    </ChartContainer>
  );
}

export function GenreChart({ data }: { data: { genre: string; loans: number }[] }) {
  const { t } = useI18n();
  const genreConfig = { loans: { label: t("charts.loans"), color: "var(--chart-2)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={genreConfig} className="aspect-auto h-56 w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis dataKey="genre" type="category" tickLine={false} axisLine={false} width={110} tick={{ fontSize: 12 }} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
        <Bar dataKey="loans" fill="var(--color-loans)" radius={4} barSize={18} />
      </BarChart>
    </ChartContainer>
  );
}
