import { translatorFor } from "@/i18n";
import type { MessageKey, Params } from "@/i18n/translate";

/**
 * An expected error shown to the user (a broken rule, a missing permission). It carries a message
 * key so it can be shown in the user's language; `message` is the English text for logs and tests.
 */
export class AppError extends Error {
  constructor(
    readonly key: MessageKey,
    readonly params?: Params,
  ) {
    super(translatorFor("en").t(key, params));
  }
}
