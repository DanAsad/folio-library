"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { addFine, resolveFine } from "@/lib/library";
import { deliverPendingEmails } from "@/lib/reminders";
import { authorize } from "@/lib/session";
import { fineInput } from "@/lib/validation";
import { run } from "./result";

export async function settleFine(fineId: string, outcome: "paid" | "waived", note?: string) {
  return run(async () => {
    const user = await authorize("fines:manage");
    const res = await resolveFine({ libraryId: user.library.id, fineId, outcome: z.enum(["paid", "waived"]).parse(outcome), actorId: user.id, note });
    revalidatePath("/", "layout");
    return { message: `${res.amount} ${outcome === "paid" ? "payment recorded" : "waived"} for ${res.memberName}.` };
  });
}

export async function chargeFine(input: z.input<typeof fineInput>) {
  return run(async () => {
    const user = await authorize("fines:manage");
    const data = fineInput.parse(input);
    const res = await addFine({ libraryId: user.library.id, userId: data.userId, amountCents: data.amount, reason: data.reason, note: data.note, actorId: user.id });
    revalidatePath("/", "layout");
    after(async () => deliverPendingEmails(await getDb(), { limit: 5 }));
    return { message: `${res.amount} charged to ${res.memberName}.` };
  });
}
