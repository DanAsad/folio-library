import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { isLocale, LOCALE_COOKIE, negotiateLocale, type Locale } from "./config";
import { MESSAGES, translatorFor } from "./index";

/** The visitor's language: their choice (cookie), else the browser's Accept-Language. */
export const getLocale = cache(async (): Promise<Locale> => {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;
  return negotiateLocale((await headers()).get("accept-language"));
});

/** Translator for the current request. */
export const getI18n = cache(async () => translatorFor(await getLocale()));

export const getMessages = (locale: Locale) => MESSAGES[locale];
