"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createLibrary, resetDemoData, updateLibrarySettings } from "@/lib/actions/library";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/client";

export type SettingsValues = {
  name: string;
  tagline: string;
  loanDays: string;
  maxLoans: string;
  maxRenewals: string;
  holdPickupDays: string;
  finePerDay: string;
  fineGraceDays: string;
  maxFine: string;
  lostItemFee: string;
  blockAt: string;
  currency: string;
};

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SettingsForm({ initial }: { initial: SettingsValues }) {
  const router = useRouter();
  const { t } = useI18n();
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const set = (k: keyof SettingsValues) => (e: React.ChangeEvent<HTMLInputElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const num = (k: keyof SettingsValues, suffix?: string) => (
    <div className="relative">
      <Input inputMode="decimal" value={v[k]} onChange={set(k)} className={suffix ? "pr-14" : undefined} required />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>}
    </div>
  );

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await updateLibrarySettings({ ...v, currency: v.currency as "USD" | "CAD" | "EUR" | "GBP" });
          if (res.ok) {
            toast.success(res.message);
            router.refresh();
          } else toast.error(res.error);
        });
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.library")}</CardTitle>
          <CardDescription>{t("settings.libraryBody")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label={t("members.name")}>
            <Input value={v.name} onChange={set("name")} required />
          </Field>
          <Field label={t("settings.tagline")}>
            <Input value={v.tagline} onChange={set("tagline")} placeholder={t("members.optional")} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.lending")}</CardTitle>
          <CardDescription>{t("settings.lendingBody")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("fields.loanDays")}>{num("loanDays", t("settings.unitDays"))}</Field>
          <Field label={t("settings.booksAtATime")}>{num("maxLoans", t("settings.unitBooks"))}</Field>
          <Field label={t("settings.renewalsPerLoan")}>{num("maxRenewals", t("settings.unitTimes"))}</Field>
          <Field label={t("settings.pickupWindow")}>{num("holdPickupDays", t("settings.unitDays"))}</Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("loansPage.fines")}</CardTitle>
          <CardDescription>{t("settings.finesBody")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("settings.currency")}>
            <Select value={v.currency} onValueChange={(c) => setV((s) => ({ ...s, currency: c }))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["USD", "CAD", "EUR", "GBP"].map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("settings.finePerDay")}>{num("finePerDay", v.currency)}</Field>
          <Field label={t("fields.fineGraceDays")} hint={t("settings.graceHint")}>
            {num("fineGraceDays", t("settings.unitDays"))}
          </Field>
          <Field label={t("settings.maxPerLoan")} hint={t("settings.maxHint")}>
            {num("maxFine", v.currency)}
          </Field>
          <Field label={t("fields.lostItemFee")}>{num("lostItemFee", v.currency)}</Field>
          <Field label={t("settings.pauseWhen")} hint={t("settings.pauseHint")}>
            {num("blockAt", v.currency)}
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} {t("settings.save")}
        </Button>
      </div>
    </form>
  );
}

export function NewLibraryForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [tagline, setTagline] = useState("");
  const [pending, start] = useTransition();
  const { t } = useI18n();
  return (
    <form
      className="grid gap-4 sm:grid-cols-[2fr_1fr_2fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await createLibrary({ name, code, tagline });
          if (res.ok) {
            toast.success(res.message);
            router.push("/settings");
            router.refresh();
          } else toast.error(res.error);
        });
      }}
    >
      <Field label={t("members.name")}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("settings.newNamePlaceholder")} required />
      </Field>
      <Field label={t("settings.prefix")}>
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="EST" maxLength={5} className="font-mono" required />
      </Field>
      <Field label={t("settings.tagline")}>
        <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder={t("members.optional")} />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Building2 />} {t("settings.create")}
      </Button>
    </form>
  );
}

export function ResetDemoButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { t } = useI18n();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />} {t("settings.resetNow")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("settings.resetTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("settings.resetBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await resetDemoData();
                if (res.ok) {
                  toast.success(res.message);
                  router.push("/dashboard");
                  router.refresh();
                } else toast.error(res.error);
              });
            }}
          >
            {t("settings.reset")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
