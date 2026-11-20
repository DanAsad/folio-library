"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
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
import { deliverPendingEmails } from "@/lib/reminders";
import { ActionError, authorize } from "@/lib/session";
import { getI18n } from "@/i18n/server";
import type { Translator } from "@/i18n";
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
    const { t } = await getI18n();
    const targetId = forUserId && forUserId !== user.id ? forUserId : user.id;
    if ((targetId !== user.id || barcode) && !can(user.role, "loans:manage")) {
      throw new ActionError("errors.staffOnlyCheckout");
    }
    const res = await borrow({ libraryId: user.library.id, bookId, userId: targetId, actorId: user.id, barcode: barcode || undefined });
    revalidatePath("/", "layout");
    const params = { title: res.title, barcode: res.barcode, member: res.memberName, date: res.loan.dueAt };
    return { message: targetId === user.id ? t("actions.borrowed", params) : t("actions.checkedOut", params) };
  });
}

function returnedMessage({ t }: Translator, res: { title: string; late: boolean; fineCents: number; currency: string }) {
  if (res.fineCents) return t("actions.returnedFine", { title: res.title, amount: { cents: res.fineCents, currency: res.currency } });
  return t(res.late ? "actions.returnedLate" : "actions.returned", { title: res.title });
}

export async function returnBook(loanId: string, copyCondition?: string) {
  return run(async () => {
    const user = await authorize();
    const staff = can(user.role, "loans:manage");
    const res = await giveBack({ libraryId: user.library.id, loanId, actorId: user.id, isStaff: staff, condition: staff ? condition.parse(copyCondition) : undefined });
    revalidatePath("/", "layout");
    sendEmailsLater();
    return { message: returnedMessage(await getI18n(), res) };
  });
}

/** Desk check-in by scanning a copy's barcode. */
export async function checkInBarcode(barcode: string, copyCondition?: string) {
  return run(async () => {
    const user = await authorize("loans:manage");
    const res = await checkInByBarcode({ libraryId: user.library.id, barcode, actorId: user.id, condition: condition.parse(copyCondition || undefined) });
    revalidatePath("/", "layout");
    sendEmailsLater();
    const i18n = await getI18n();
    return { message: i18n.t("actions.fromMember", { message: returnedMessage(i18n, res), member: res.memberName }) };
  });
}

export async function renewBook(loanId: string) {
  return run(async () => {
    const user = await authorize();
    const res = await renew({ libraryId: user.library.id, loanId, actorId: user.id, isStaff: can(user.role, "loans:manage") });
    revalidatePath("/", "layout");
    const { t } = await getI18n();
    return { message: t("actions.renewed", { title: res.title, date: res.dueAt }) };
  });
}

export async function markLost(loanId: string) {
  return run(async () => {
    const user = await authorize("loans:manage");
    const res = await markLoanLost({ libraryId: user.library.id, loanId, actorId: user.id });
    revalidatePath("/", "layout");
    sendEmailsLater();
    const { t } = await getI18n();
    return {
      message: res.feeCents
        ? t("actions.markedLostFee", { barcode: res.barcode, amount: { cents: res.feeCents, currency: res.currency } })
        : t("actions.markedLost", { barcode: res.barcode }),
    };
  });
}

export async function joinWaitlist(bookId: string) {
  return run(async () => {
    const user = await authorize();
    const res = await hold({ libraryId: user.library.id, bookId, userId: user.id });
    revalidatePath("/", "layout");
    const { t } = await getI18n();
    return { message: t("actions.joinedWaitlist", { position: res.position, title: res.title }) };
  });
}

export async function cancelHold(holdId: string) {
  return run(async () => {
    const user = await authorize();
    const res = await cancel({ libraryId: user.library.id, holdId, actorId: user.id, isStaff: can(user.role, "loans:manage") });
    revalidatePath("/", "layout");
    sendEmailsLater();
    const { t } = await getI18n();
    return { message: t("actions.leftWaitlist", { title: res.title }) };
  });
}
