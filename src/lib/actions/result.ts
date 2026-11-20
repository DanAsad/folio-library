import { ZodError } from "zod";
import { getI18n } from "@/i18n/server";
import { AppError } from "@/lib/errors";
import { translateIssue } from "@/i18n/issues";

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string };

/** Turns expected errors into a friendly result in the user's language; unexpected ones are logged. */
export async function run<T>(fn: () => Promise<{ message?: string; data?: T }>): Promise<ActionResult<T>> {
  try {
    const res = await fn();
    return { ok: true, ...res };
  } catch (err) {
    const i18n = await getI18n();
    if (err instanceof AppError) return { ok: false, error: i18n.tk(err.key, err.params) };
    if (err instanceof ZodError) {
      // Validation messages are message keys (see src/i18n/issues.ts); other text passes through.
      const message = err.issues[0]?.message;
      return { ok: false, error: message ? translateIssue(i18n, message) : i18n.t("common.invalidInput") };
    }
    console.error(err);
    return { ok: false, error: i18n.t("common.somethingWrong") };
  }
}
