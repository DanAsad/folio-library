"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { format } from "date-fns";
import { z } from "zod";
import { copyConditionEnum } from "@/lib/db/schema";
import { getDb } from "@/lib/db/client";
import { can } from "@/lib/permissions";
import {
  borrowBook as borrow,
  cancelHold as cancel,
  checkInByBarcode,
  markLoanLost,
  placeHold as hold,
  renewLoan as renew,
  returnLoan as giveBack,
} from "@/lib/library";
import { formatMoney } from "@/lib/money";
import { deliverPendingEmails } from "@/lib/reminders";
import { ActionError, authorize } from "@/lib/session";
import { run } from "./result";

const condition = z.enum(copyConditionEnum.enumValues).optional();

/** Emails (if configured) go out after the response, so the desk never waits on them. */
function sendEmailsLater() {
  after(async () => deliverPendingEmails(await getDb(), { limit: 20 }));
}

/** Borrow for yourself, or (staff) check a book out to a member, optionally a specific copy. */
export async function borrowBook(bookId: string, forUserId?: string, barcode?: string) {
  return run(async () => {
    const user = await authorize();
    const targetId = forUserId && forUserId !== user.id ? forUserId : user.id;
    if ((targetId !== user.id || barcode) && !can(user.role, "loans:manage")) {
      throw new ActionError("Only librarians can check books out to other members.");
    }
    const res = await borrow({ libraryId: user.library.id, bookId, userId: targetId, actorId: user.id, barcode: barcode || undefined });
    revalidatePath("/", "layout");
    const due = format(res.loan.dueAt, "MMM d");
    return {
      message:
        targetId === user.id
          ? `You borrowed “${res.title}” (copy ${res.barcode}). It's due ${due}.`
          : `“${res.title}” (${res.barcode}) checked out to ${res.memberName}, due ${due}.`,
    };
  });
}

function returnedMessage(res: { title: string; late: boolean; fineCents: number; currency: string }) {
  const fine = res.fineCents ? ` A late fee of ${formatMoney(res.fineCents, res.currency)} was added.` : res.late ? " It was a little late; no fee was charged." : "";
  return `“${res.title}” returned.${fine}`;
}

export async function returnBook(loanId: string, copyCondition?: string) {
  return run(async () => {
    const user = await authorize();
    const staff = can(user.role, "loans:manage");
    const res = await giveBack({ libraryId: user.library.id, loanId, actorId: user.id, isStaff: staff, condition: staff ? condition.parse(copyCondition) : undefined });
    revalidatePath("/", "layout");
    sendEmailsLater();
    return { message: returnedMessage(res) };
  });
}

/** Desk check-in by scanning a copy's barcode. */
export async function checkInBarcode(barcode: string, copyCondition?: string) {
  return run(async () => {
    const user = await authorize("loans:manage");
    const res = await checkInByBarcode({ libraryId: user.library.id, barcode, actorId: user.id, condition: condition.parse(copyCondition || undefined) });
    revalidatePath("/", "layout");
    sendEmailsLater();
    return { message: `${returnedMessage(res)} (from ${res.memberName})` };
  });
}

export async function renewBook(loanId: string) {
  return run(async () => {
    const user = await authorize();
    const res = await renew({ libraryId: user.library.id, loanId, actorId: user.id, isStaff: can(user.role, "loans:manage") });
    revalidatePath("/", "layout");
    return { message: `Renewed “${res.title}”. New due date: ${format(res.dueAt, "MMM d")}.` };
  });
}

export async function markLost(loanId: string) {
  return run(async () => {
    const user = await authorize("loans:manage");
    const res = await markLoanLost({ libraryId: user.library.id, loanId, actorId: user.id });
    revalidatePath("/", "layout");
    sendEmailsLater();
    return { message: `Copy ${res.barcode} marked lost${res.feeCents ? `; ${formatMoney(res.feeCents, res.currency)} replacement fee charged` : ""}.` };
  });
}

export async function joinWaitlist(bookId: string) {
  return run(async () => {
    const user = await authorize();
    const res = await hold({ libraryId: user.library.id, bookId, userId: user.id });
    revalidatePath("/", "layout");
    return { message: `You're #${res.position} on the waitlist for “${res.title}”. We'll hold a copy for you when it's back.` };
  });
}

export async function cancelHold(holdId: string) {
  return run(async () => {
    const user = await authorize();
    const res = await cancel({ libraryId: user.library.id, holdId, actorId: user.id, isStaff: can(user.role, "loans:manage") });
    revalidatePath("/", "layout");
    sendEmailsLater();
    return { message: `Left the waitlist for “${res.title}”.` };
  });
}
