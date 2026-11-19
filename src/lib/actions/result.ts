import { ActionError } from "@/lib/session";
import { LibraryError } from "@/lib/library";
import { ZodError } from "zod";

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string };

/** Turns expected errors into a friendly result; unexpected ones are logged. */
export async function run<T>(fn: () => Promise<{ message?: string; data?: T }>): Promise<ActionResult<T>> {
  try {
    const res = await fn();
    return { ok: true, ...res };
  } catch (err) {
    if (err instanceof ActionError || err instanceof LibraryError) return { ok: false, error: err.message };
    if (err instanceof ZodError) return { ok: false, error: err.issues[0]?.message ?? "Invalid input." };
    console.error(err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
