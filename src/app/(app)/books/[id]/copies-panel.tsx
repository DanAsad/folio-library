"use client";

import { useState, useTransition } from "react";
import { Archive, Loader2, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addCopiesToBook, editCopy } from "@/lib/actions/books";
import type { ActionResult } from "@/lib/actions/result";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";

const CONDITIONS = ["new", "good", "fair", "poor", "damaged"] as const;
const CONDITION_TONE: Record<string, string> = {
  new: "bg-success/15 text-success",
  good: "bg-accent text-accent-foreground",
  fair: "bg-muted text-foreground",
  poor: "bg-warning/15 text-[color-mix(in_oklch,var(--warning),black_25%)] dark:text-warning",
  damaged: "bg-destructive/12 text-destructive",
};

export type CopyRow = {
  id: string;
  barcode: string;
  condition: string;
  status: "active" | "lost" | "withdrawn";
  note: string | null;
  acquiredAt: string;
  loan: { member: string; dueAt: string } | null;
};

function useRun() {
  const [pending, start] = useTransition();
  const [key, setKey] = useState<string | null>(null);
  const run = (k: string, fn: () => Promise<ActionResult<unknown>>) => {
    setKey(k);
    start(async () => {
      const res = await fn();
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });
  };
  return { pending, key, run };
}

export function CopiesPanel({ bookId, copies, canEdit }: { bookId: string; copies: CopyRow[]; canEdit: boolean }) {
  const { pending, key, run } = useRun();
  const { t, date } = useI18n();
  const [count, setCount] = useState("1");
  const [condition, setCondition] = useState("new");
  const inCirculation = copies.filter((c) => c.status === "active");
  const retired = copies.filter((c) => c.status !== "active");

  const row = (c: CopyRow) => {
    const busy = pending && key === c.id;
    const overdue = c.loan && new Date(c.loan.dueAt) < new Date();
    return (
      <TableRow key={c.id} className={cn(c.status !== "active" && "opacity-70")}>
        <TableCell className="font-mono text-sm">{c.barcode}</TableCell>
        <TableCell>
          {canEdit && c.status === "active" ? (
            <Select value={c.condition} onValueChange={(v) => run(c.id, () => editCopy(c.id, { condition: v as (typeof CONDITIONS)[number] }))} disabled={pending}>
              <SelectTrigger size="sm" className="h-7 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITIONS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`conditions.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge className={CONDITION_TONE[c.condition]}>{t(`conditions.${c.condition as (typeof CONDITIONS)[number]}`)}</Badge>
          )}
        </TableCell>
        <TableCell className="text-sm">
          {c.status === "lost" ? (
            <Badge variant="outline" className="border-destructive/40 text-destructive">
              {t("copyStatus.lost")}
            </Badge>
          ) : c.status === "withdrawn" ? (
            <Badge variant="outline">{t("copyStatus.withdrawn")}</Badge>
          ) : c.loan ? (
            <span className={cn(overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
              {c.loan.member} · {t(overdue ? "copies.overdueSince" : "copies.due", { date: new Date(c.loan.dueAt) })}
            </span>
          ) : (
            <span className="text-success">{t("copies.onShelf")}</span>
          )}
          {c.note && <p className="text-xs text-muted-foreground">{c.note}</p>}
        </TableCell>
        <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{date(c.acquiredAt, "monthYear")}</TableCell>
        {canEdit && (
          <TableCell className="text-right">
            {c.status === "active" ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending || Boolean(c.loan)}
                title={c.loan ? t("copies.checkInFirst") : t("copies.withdrawTip")}
                onClick={() => run(c.id, () => editCopy(c.id, { status: "withdrawn" }))}
              >
                {busy ? <Loader2 className="animate-spin" /> : <Archive />} {t("copies.withdraw")}
              </Button>
            ) : (
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(c.id, () => editCopy(c.id, { status: "active", note: null }))}>
                {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />} {c.status === "lost" ? t("copies.found") : t("copies.restore")}
              </Button>
            )}
          </TableCell>
        )}
      </TableRow>
    );
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3"
          onSubmit={(e) => {
            e.preventDefault();
            run("add", () => addCopiesToBook(bookId, Number(count), condition));
          }}
        >
          <div className="space-y-1">
            <label htmlFor="copy-count" className="text-xs text-muted-foreground">
              {t("copies.newCopies")}
            </label>
            <Input id="copy-count" type="number" min={1} max={50} value={count} onChange={(e) => setCount(e.target.value)} className="h-8 w-20" />
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">{t("copies.condition")}</span>
            <Select value={condition} onValueChange={setCondition}>
              <SelectTrigger size="sm" className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITIONS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`conditions.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending && key === "add" ? <Loader2 className="animate-spin" /> : <Plus />} {t("copies.add")}
          </Button>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>{t("copies.barcode")}</TableHead>
              <TableHead>{t("copies.condition")}</TableHead>
              <TableHead>{t("copies.where")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("copies.acquired")}</TableHead>
              {canEdit && <TableHead className="text-right">{t("copies.actions")}</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {inCirculation.map(row)}
            {retired.map(row)}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        {retired.length
          ? t("copies.summaryRetired", { count: inCirculation.length, retired: retired.length })
          : t("copies.summary", { count: inCirculation.length })}
      </p>
    </div>
  );
}
