// Text saved in the database (notifications, the activity log) is stored as a message key plus
// its parameters, so each reader sees it in their own language. An English copy is kept too,
// for emails, CSV exports and as a fallback.
import { translatorFor } from "./index";
import type { MessageKey, Money, Param, Translator } from "./translate";

/** A parameter that is itself translated when shown, e.g. a copy condition. */
export type KeyParam = { $t: MessageKey };
type StoredParam = string | number | null | Money | KeyParam | { $date: string };
export type StoredText = { key: MessageKey; params?: Record<string, StoredParam> };

export const keyParam = (key: MessageKey): KeyParam => ({ $t: key });

export function stored(key: MessageKey, params?: Record<string, Param | KeyParam>): StoredText {
  if (!params) return { key };
  const out: Record<string, StoredParam> = {};
  for (const [k, v] of Object.entries(params)) out[k] = v instanceof Date ? { $date: v.toISOString() } : (v ?? null);
  return { key, params: out };
}

function revive(t: Translator, params: StoredText["params"]): Record<string, Param> | undefined {
  if (!params) return undefined;
  const out: Record<string, Param> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v && typeof v === "object" && "$date" in v) out[k] = new Date(v.$date);
    else if (v && typeof v === "object" && "$t" in v) out[k] = t.tk(v.$t);
    else out[k] = v;
  }
  return out;
}

/** Renders stored text in the reader's language, falling back to the saved English copy. */
export function renderStored(t: Translator, text: StoredText | null | undefined, fallback: string): string {
  if (!text?.key || !t.has(text.key)) return fallback;
  return t.tk(text.key, revive(t, text.params));
}

/** The English rendering, saved alongside the key. */
export const english = (text: StoredText) => renderStored(translatorFor("en"), text, text.key);

/** Fields for an activity row: `{ message, i18n }`. */
export function activityText(key: MessageKey, params?: Record<string, Param | KeyParam>) {
  const text = stored(key, params);
  return { message: english(text), i18n: text };
}
