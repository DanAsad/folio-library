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
          <CardTitle>Library</CardTitle>
          <CardDescription>How this library appears to members.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={v.name} onChange={set("name")} required />
          </Field>
          <Field label="Tagline">
            <Input value={v.tagline} onChange={set("tagline")} placeholder="Optional" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lending rules</CardTitle>
          <CardDescription>Apply to new loans and holds. Existing due dates stay as they are.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Loan period">{num("loanDays", "days")}</Field>
          <Field label="Books at a time">{num("maxLoans", "books")}</Field>
          <Field label="Renewals per loan">{num("maxRenewals", "times")}</Field>
          <Field label="Hold pickup window">{num("holdPickupDays", "days")}</Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fines</CardTitle>
          <CardDescription>Late fees are charged automatically when a book comes back late. Set the daily fine to 0 to turn them off.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Currency">
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
          <Field label="Fine per day late">{num("finePerDay", v.currency)}</Field>
          <Field label="Grace period" hint="Days late before fines start">
            {num("fineGraceDays", "days")}
          </Field>
          <Field label="Maximum per loan" hint="0 means no cap">
            {num("maxFine", v.currency)}
          </Field>
          <Field label="Lost-item fee">{num("lostItemFee", v.currency)}</Field>
          <Field label="Pause borrowing when owing" hint="0 never pauses borrowing">
            {num("blockAt", v.currency)}
          </Field>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Save settings
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
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Eastside Branch Library" required />
      </Field>
      <Field label="Barcode prefix">
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="EST" maxLength={5} className="font-mono" required />
      </Field>
      <Field label="Tagline">
        <Input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Optional" />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Building2 />} Create
      </Button>
    </form>
  );
}

export function ResetDemoButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reset demo data now
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset all demo data?</AlertDialogTitle>
          <AlertDialogDescription>
            Every library is restored to the sample catalogue, loans, fines and waitlists. Changes anyone made are lost. Accounts that signed in with SSO keep their
            login and rejoin the main library.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
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
            Reset
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
