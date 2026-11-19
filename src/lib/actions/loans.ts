"use server";

import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { can } from "@/lib/permissions";
import { borrowBook as borrow, cancelHold as cancel, placeHold as hold, renewLoan as renew, returnLoan as giveBack } from "@/lib/library";
import { ActionError, authorize } from "@/lib/session";
import { run } from "./result";

/** Borrow for yourself, or (staff) check a book out to a member. */
export async function borrowBook(bookId: string, forUserId?: string) {
  return run(async () => {
    const user = await authorize();
    const targetId = forUserId && forUserId !== user.id ? forUserId : user.id;
    if (targetId !== user.id && !can(user.role, "loans:manage")) {
      throw new ActionError("Only librarians can check books out to other members.");
    }
    const res = await borrow({ bookId, userId: targetId, actorId: user.id });
    revalidatePath("/", "layout");
    const due = format(res.loan.dueAt, "MMM d");
    return {
      message: targetId === user.id ? `You borrowed “${res.title}”. It's due ${due}.` : `“${res.title}” checked out to ${res.memberName}, due ${due}.`,
    };
  });
}

export async function returnBook(loanId: string) {
  return run(async () => {
    const user = await authorize();
    const res = await giveBack({ loanId, actorId: user.id, isStaff: can(user.role, "loans:manage") });
    revalidatePath("/", "layout");
    return { message: `“${res.title}” returned${res.late ? " (it was overdue)" : ""}. Thanks!` };
  });
}

export async function renewBook(loanId: string) {
  return run(async () => {
    const user = await authorize();
    const res = await renew({ loanId, actorId: user.id, isStaff: can(user.role, "loans:manage") });
    revalidatePath("/", "layout");
    return { message: `Renewed “${res.title}”. New due date: ${format(res.dueAt, "MMM d")}.` };
  });
}

export async function joinWaitlist(bookId: string) {
  return run(async () => {
    const user = await authorize();
    const res = await hold({ bookId, userId: user.id });
    revalidatePath("/", "layout");
    return { message: `You're #${res.position} on the waitlist for “${res.title}”. We'll hold a copy for you when it's back.` };
  });
}

export async function cancelHold(holdId: string) {
  return run(async () => {
    const user = await authorize();
    const res = await cancel({ holdId, actorId: user.id, isStaff: can(user.role, "loans:manage") });
    revalidatePath("/", "layout");
    return { message: `Left the waitlist for “${res.title}”.` };
  });
}
