// Translations outside a request (background jobs, domain errors, tests). Pages and actions use
// getI18n() from "@/i18n/server", client components use useI18n() from "@/i18n/client".
import { DEFAULT_LOCALE, type Locale } from "./config";
import { en } from "./messages/en";
import { es } from "./messages/es";
import { fr } from "./messages/fr";
import { it } from "./messages/it";
import { createTranslator, type Translator } from "./translate";

export const MESSAGES = { en, fr, es, it } as const;

const cache = new Map<Locale, Translator>();

export function translatorFor(locale: Locale = DEFAULT_LOCALE): Translator {
  let t = cache.get(locale);
  if (!t) cache.set(locale, (t = createTranslator(locale, MESSAGES[locale], en)));
  return t;
}

export type { Locale } from "./config";
export type { MessageKey, Params, Translator } from "./translate";
