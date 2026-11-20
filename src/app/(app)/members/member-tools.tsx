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
  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => settleFine(fineId, "paid"))}>
        {pending ? <Loader2 className="animate-spin" /> : <HandCoins />} Paid
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => settleFine(fineId, "waived", "Waived at the desk"))}>
        <XCircle /> Waive
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
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Receipt /> Charge a fee
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Charge a fee</DialogTitle>
          <DialogDescription>For damage or anything else the automatic late fees don&apos;t cover. The member is notified.</DialogDescription>
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
            <Label>Member</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a member…" />
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
              <Label htmlFor="fine-amount">Amount ({currency})</Label>
              <Input id="fine-amount" inputMode="decimal" placeholder="3.50" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={(v) => setReason(v as typeof reason)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="damaged">Damage</SelectItem>
                  <SelectItem value="lost">Lost item</SelectItem>
                  <SelectItem value="overdue">Late return</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="fine-note">Note</Label>
            <Input id="fine-note" placeholder="e.g. Torn cover on CEN-00012" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="charge-form" disabled={pending || !userId || !amount}>
            {pending && <Loader2 className="animate-spin" />} Charge
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
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Add person
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add someone to {libraryName}</DialogTitle>
          <DialogDescription>Creates a member record so staff can lend books to them at the desk. Only the demo accounts can sign in.</DialogDescription>
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
            <Label htmlFor="person-email">Email</Label>
            <Input id="person-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="person-name">Name</Label>
            <Input id="person-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
          </div>
          <div className="grid gap-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="librarian">Librarian</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="person-form" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />} Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
