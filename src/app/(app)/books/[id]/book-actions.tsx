"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNowStrict } from "date-fns";
import { BellPlus, BookCheck, BookUp, Check, ChevronsUpDown, Loader2, RefreshCw, Trash2, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { deleteBook } from "@/lib/actions/books";
import { borrowBook, cancelHold, joinWaitlist, renewBook, returnBook } from "@/lib/actions/loans";
import type { ActionResult } from "@/lib/actions/result";
import { cn } from "@/lib/utils";

function useAction() {
  const [pending, start] = useTransition();
  const [which, setWhich] = useState<string | null>(null);
  const run = (key: string, fn: () => Promise<ActionResult<unknown>>, after?: () => void) => {
    setWhich(key);
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(res.message);
        after?.();
      } else toast.error(res.error);
    });
  };
  return { pending, which, run };
}

const Spin = ({ show, children }: { show: boolean; children: React.ReactNode }) =>
  show ? <Loader2 className="animate-spin" /> : <>{children}</>;

type Props = {
  bookId: string;
  available: number;
  myLoan: { id: string; dueAt: string; renewals: number } | null;
  myHold: { id: string; status: string; expiresAt: string | null; position: number } | null;
  staff: boolean;
  members: { id: string; name: string; email: string }[];
};

export function BookActions({ bookId, available, myLoan, myHold, staff, members }: Props) {
  const { pending, which, run } = useAction();

  let primary: React.ReactNode;
  if (myLoan) {
    const due = new Date(myLoan.dueAt);
    const overdue = due < new Date();
    primary = (
      <div className="space-y-3">
        <p className={cn("rounded-md px-3 py-2 text-sm", overdue ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground")}>
          {overdue ? `You have this book. It was due ${formatDistanceToNowStrict(due, { addSuffix: true })}.` : `You have this book until ${format(due, "EEEE, MMM d")}.`}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={pending} onClick={() => run("return", () => returnBook(myLoan.id))}>
            <Spin show={pending && which === "return"}>
              <BookCheck />
            </Spin>
            Return
          </Button>
          <Button variant="outline" disabled={pending || myLoan.renewals >= 2} onClick={() => run("renew", () => renewBook(myLoan.id))}>
            <Spin show={pending && which === "renew"}>
              <RefreshCw />
            </Spin>
            Renew
          </Button>
        </div>
      </div>
    );
  } else if (myHold?.status === "ready") {
    primary = (
      <div className="space-y-3">
        <p className="rounded-md bg-success/12 px-3 py-2 text-sm text-success">
          A copy is reserved for you{myHold.expiresAt ? ` until ${format(new Date(myHold.expiresAt), "MMM d")}` : ""}.
        </p>
        <Button className="w-full" disabled={pending} onClick={() => run("borrow", () => borrowBook(bookId))}>
          <Spin show={pending && which === "borrow"}>
            <BookUp />
          </Spin>
          Borrow my reserved copy
        </Button>
      </div>
    );
  } else if (myHold) {
    primary = (
      <div className="space-y-3">
        <p className="rounded-md bg-muted px-3 py-2 text-sm">
          You&apos;re <strong>#{myHold.position}</strong> on the waitlist. We&apos;ll reserve a copy for you when one comes back.
        </p>
        <Button variant="outline" className="w-full" disabled={pending} onClick={() => run("cancel", () => cancelHold(myHold.id))}>
          <Spin show={pending && which === "cancel"}>
            <X />
          </Spin>
          Leave waitlist
        </Button>
      </div>
    );
  } else if (available > 0) {
    primary = (
      <Button size="lg" className="h-10 w-full" disabled={pending} onClick={() => run("borrow", () => borrowBook(bookId))}>
        <Spin show={pending && which === "borrow"}>
          <BookUp />
        </Spin>
        Borrow for 14 days
      </Button>
    );
  } else {
    primary = (
      <Button size="lg" variant="secondary" className="h-10 w-full" disabled={pending} onClick={() => run("hold", () => joinWaitlist(bookId))}>
        <Spin show={pending && which === "hold"}>
          <BellPlus />
        </Spin>
        Join the waitlist
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      {primary}
      {staff && <LendDialog bookId={bookId} members={members} disabled={pending} />}
    </div>
  );
}

function LendDialog({ bookId, members, disabled }: { bookId: string; members: Props["members"]; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);
  const { pending, run } = useAction();
  const member = members.find((m) => m.id === memberId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full" disabled={disabled}>
          <UserPlus /> Check out to a member…
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Check out to a member</DialogTitle>
          <DialogDescription>The loan will be due in 14 days. Members on the waitlist keep their place.</DialogDescription>
        </DialogHeader>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className="h-10 w-full justify-between font-normal">
              {member ? `${member.name} · ${member.email}` : "Choose a member…"}
              <ChevronsUpDown className="opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
            <Command>
              <CommandInput placeholder="Search members…" />
              <CommandList>
                <CommandEmpty>No member found.</CommandEmpty>
                <CommandGroup>
                  {members.map((m) => (
                    <CommandItem
                      key={m.id}
                      value={`${m.name} ${m.email}`}
                      onSelect={() => {
                        setMemberId(m.id);
                        setPickerOpen(false);
                      }}
                    >
                      <Check className={cn(memberId === m.id ? "opacity-100" : "opacity-0")} />
                      <span className="truncate">{m.name}</span>
                      <span className="ml-auto truncate text-xs text-muted-foreground">{m.email}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!memberId || pending}
            onClick={() =>
              run("lend", () => borrowBook(bookId, memberId!), () => {
                setOpen(false);
                setMemberId(null);
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />} Check out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CheckInButton({ loanId, size = "sm", label = "Check in" }: { loanId: string; size?: "sm" | "default"; label?: string }) {
  const { pending, run } = useAction();
  return (
    <Button size={size} variant="outline" disabled={pending} onClick={() => run("checkin", () => returnBook(loanId))}>
      <Spin show={pending}>
        <BookCheck />
      </Spin>
      {label}
    </Button>
  );
}

export function RenewButton({ loanId, disabled }: { loanId: string; disabled?: boolean }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant="ghost" disabled={pending || disabled} onClick={() => run("renew", () => renewBook(loanId))}>
      <Spin show={pending}>
        <RefreshCw />
      </Spin>
      Renew
    </Button>
  );
}

export function CancelHoldButton({ holdId }: { holdId: string }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("cancel", () => cancelHold(holdId))}>
      <Spin show={pending}>
        <X />
      </Spin>
      Cancel
    </Button>
  );
}

export function BorrowReservedButton({ bookId }: { bookId: string }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" disabled={pending} onClick={() => run("borrow", () => borrowBook(bookId))}>
      <Spin show={pending}>
        <BookUp />
      </Spin>
      Borrow now
    </Button>
  );
}

export function DeleteBookButton({ bookId, title, disabled }: { bookId: string; title: string; disabled?: boolean }) {
  const router = useRouter();
  const { pending, run } = useAction();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" disabled={disabled} title={disabled ? "Check in all copies before deleting" : undefined}>
          <Trash2 /> Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the book, its reviews, waitlist and loan history. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              run("delete", () => deleteBook(bookId), () => router.push("/books"));
            }}
          >
            {pending && <Loader2 className="animate-spin" />} Delete book
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
