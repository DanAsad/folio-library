"use client";

import { useState, useTransition } from "react";
import { HandCoins, Loader2, Receipt, UserPlus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { chargeFine, settleFine } from "@/lib/actions/fines";
import { addPerson } from "@/lib/actions/misc";
import type { ActionResult } from "@/lib/actions/result";
import { useI18n } from "@/i18n/client";

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(res.message);
        after?.();
      } else toast.error(res.error);
    });
  return { pending, run };
}

export function FineButtons({ fineId }: { fineId: string }) {
  const { pending, run } = useRun();
  const { t } = useI18n();
  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => settleFine(fineId, "paid"))}>
        {pending ? <Loader2 className="animate-spin" /> : <HandCoins />} {t("fineStatus.paid")}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => settleFine(fineId, "waived", t("members.waivedNote")))}>
        <XCircle /> {t("members.waive")}
      </Button>
    </div>
  );
}

export function ChargeFineDialog({ members, currency }: { members: { id: string; name: string }[]; currency: string }) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<"damaged" | "lost" | "overdue">("damaged");
  const [note, setNote] = useState("");
  const { pending, run } = useRun();
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Receipt /> {t("members.chargeFee")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("members.chargeFee")}</DialogTitle>
          <DialogDescription>{t("members.chargeBody")}</DialogDescription>
        </DialogHeader>
        <form
          id="charge-form"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => chargeFine({ userId, amount, reason, note }), () => {
              setOpen(false);
              setAmount("");
              setNote("");
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label>{t("loansPage.member")}</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("bookActions.chooseMember")} />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="fine-amount">{t("members.amountIn", { currency })}</Label>
              <Input id="fine-amount" inputMode="decimal" placeholder="3.50" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label>{t("members.reason")}</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as typeof reason)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="damaged">{t("fineReasons.damaged")}</SelectItem>
                  <SelectItem value="lost">{t("fineReasons.lost")}</SelectItem>
                  <SelectItem value="overdue">{t("fineReasons.overdue")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fine-note">{t("members.note")}</Label>
            <Input id="fine-note" placeholder={t("members.notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="charge-form" disabled={pending || !userId || !amount}>
            {pending && <Loader2 className="animate-spin" />} {t("members.charge")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddPersonDialog({ libraryName }: { libraryName: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"member" | "librarian" | "admin">("member");
  const { pending, run } = useRun();
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> {t("members.addPerson")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("members.addTitle", { library: libraryName })}</DialogTitle>
          <DialogDescription>{t("members.addBody")}</DialogDescription>
        </DialogHeader>
        <form
          id="person-form"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addPerson({ email, name, role }), () => {
              setOpen(false);
              setEmail("");
              setName("");
              setRole("member");
            });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="person-email">{t("members.email")}</Label>
            <Input id="person-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="person-name">{t("members.name")}</Label>
            <Input id="person-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("members.optional")} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t("members.role")}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">{t("roles.member")}</SelectItem>
                <SelectItem value="librarian">{t("roles.librarian")}</SelectItem>
                <SelectItem value="admin">{t("roles.admin")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="person-form" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} {t("members.add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
