// Zod validation messages are message keys, optionally with parameters encoded after "?":
//   "validation.between?{"field":"fields.year","min":0,"max":2027}"
// A `field` parameter is itself a message key (the field's label) and is translated too.
import type { MessageKey, Translator } from "./translate";

export const issue = (key: MessageKey, params?: Record<string, string | number>) => (params ? `${key}?${JSON.stringify(params)}` : key);

export function translateIssue({ has, tk }: Translator, message: string): string {
  const q = message.indexOf("?");
  const key = q === -1 ? message : message.slice(0, q);
  if (!has(key)) return message;
  let params: Record<string, string | number> | undefined;
  try {
    params = q === -1 ? undefined : JSON.parse(message.slice(q + 1));
  } catch {
    params = undefined;
  }
  if (params && typeof params.field === "string") params = { ...params, field: tk(params.field) };
  return tk(key, params);
}
