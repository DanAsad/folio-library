"use client";

import { format, parseISO } from "date-fns";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const loansConfig = { loans: { label: "Loans", color: "var(--chart-1)" } } satisfies ChartConfig;
const genreConfig = { loans: { label: "Loans", color: "var(--chart-2)" } } satisfies ChartConfig;

export function WeeklyLoansChart({ data }: { data: { week: string; loans: number }[] }) {
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
        <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(v) => format(parseISO(v), "MMM d")} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(v) => `Week of ${format(parseISO(String(v)), "MMM d")}`} />} />
        <Area dataKey="loans" type="monotone" stroke="var(--color-loans)" strokeWidth={2} fill="url(#fillLoans)" />
      </AreaChart>
    </ChartContainer>
  );
}

export function GenreChart({ data }: { data: { genre: string; loans: number }[] }) {
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
