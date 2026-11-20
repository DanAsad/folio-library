import { AiError } from "@/lib/ai-client";
import type { MessageKey, Translator } from "@/i18n";

/** Turns an AI failure into a message in the reader's language. */
export function aiErrorMessage({ t, tk }: Translator, err: unknown, fallback: MessageKey) {
  if (err instanceof AiError) return tk(`ai.errors.${err.code}`, { seconds: err.retryAfter ?? 45, status: err.status ?? "" });
  return t(fallback);
}
