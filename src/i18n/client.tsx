"use client";

import { createContext, use, useMemo } from "react";
import type { Locale } from "./config";
import type { Messages } from "./messages/en";
import { createTranslator, type Translator } from "./translate";

const I18nContext = createContext<Translator | null>(null);

/** Receives only the current language's messages from the server. */
export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: React.ReactNode }) {
  const value = useMemo(() => createTranslator(locale, messages), [locale, messages]);
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): Translator {
  const ctx = use(I18nContext);
  if (!ctx) throw new Error("useI18n() must be used inside <I18nProvider>.");
  return ctx;
}
