// A small translator shared by server and client code: message lookup with {placeholders},
// plurals through Intl.PluralRules, and locale-aware dates, money and relative times.
import { createElement, Fragment, isValidElement, type ReactNode } from "react";
import { INTL_TAGS, type Locale } from "./config";
import type { Messages } from "./messages/en";

type PluralForms = { zero?: string; one: string; two?: string; few?: string; many?: string; other: string };

type Paths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : T[K] extends { other: string } ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Every message key, checked at compile time ("loans.title", "errors.loanLimit", ...). */
export type MessageKey = Paths<Messages>;

export type Money = { cents: number; currency: string };
export type Param = string | number | Date | Money | null | undefined;
export type Params = Record<string, Param>;

export type DateStyle = "short" | "medium" | "long" | "weekday" | "monthYear" | "month" | "dateTime" | "time";

const DATE_FORMATS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  short: { month: "short", day: "numeric" },
  medium: { month: "short", day: "numeric", year: "numeric" },
  long: { month: "long", day: "numeric", year: "numeric" },
  weekday: { weekday: "long", month: "short", day: "numeric" },
  monthYear: { month: "short", year: "numeric" },
  month: { month: "short" },
  dateTime: { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  time: { hour: "numeric", minute: "2-digit" },
};

const isMoney = (v: unknown): v is Money => typeof v === "object" && v !== null && "cents" in v && "currency" in v;

function flatten(obj: object, prefix = "", out = new Map<string, string | PluralForms>()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string" || (typeof v === "object" && v !== null && "other" in v)) out.set(key, v as string | PluralForms);
    else if (typeof v === "object" && v !== null) flatten(v, key, out);
  }
  return out;
}

const flatCache = new WeakMap<object, Map<string, string | PluralForms>>();
const flat = (messages: object) => {
  let map = flatCache.get(messages);
  if (!map) flatCache.set(messages, (map = flatten(messages)));
  return map;
};

export function createTranslator(locale: Locale, messages: Messages, fallback?: Messages) {
  const tag = INTL_TAGS[locale];
  const plurals = new Intl.PluralRules(tag);
  const rtf = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
  const dateFormats = new Map<DateStyle, Intl.DateTimeFormat>();
  const moneyFormats = new Map<string, Intl.NumberFormat>();

  const date = (value: Date | string | number, style: DateStyle = "short", timeZone?: string) => {
    const d = value instanceof Date ? value : new Date(value);
    if (timeZone) return new Intl.DateTimeFormat(tag, { ...DATE_FORMATS[style], timeZone }).format(d);
    let f = dateFormats.get(style);
    if (!f) dateFormats.set(style, (f = new Intl.DateTimeFormat(tag, DATE_FORMATS[style])));
    return f.format(d);
  };

  const money = (cents: number, currency = "USD") => {
    let f = moneyFormats.get(currency);
    if (!f) moneyFormats.set(currency, (f = new Intl.NumberFormat(tag, { style: "currency", currency })));
    return f.format(cents / 100);
  };

  const number = (n: number, options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(tag, options).format(n);

  /** "3 days ago", "in 2 hours", "yesterday". */
  const relative = (value: Date | string | number, now = Date.now()) => {
    const seconds = Math.round((new Date(value).getTime() - now) / 1000);
    const abs = Math.abs(seconds);
    const units: [Intl.RelativeTimeFormatUnit, number][] = [
      ["year", 31_536_000],
      ["month", 2_592_000],
      ["week", 604_800],
      ["day", 86_400],
      ["hour", 3_600],
      ["minute", 60],
    ];
    for (const [unit, size] of units) if (abs >= size) return rtf.format(Math.round(seconds / size), unit);
    return rtf.format(0, "second");
  };

  const formatParam = (v: Param): string => {
    if (v === null || v === undefined) return "";
    if (v instanceof Date) return date(v);
    if (isMoney(v)) return money(v.cents, v.currency);
    return String(v);
  };

  const lookup = (key: string, params?: Record<string, unknown>) => {
    const entry = flat(messages).get(key) ?? (fallback ? flat(fallback).get(key) : undefined);
    if (entry === undefined) return undefined;
    if (typeof entry === "string") return entry;
    const count = Number(params?.count ?? 0);
    const form = count === 0 && entry.zero ? "zero" : plurals.select(count);
    return entry[form as keyof PluralForms] ?? entry.other;
  };

  /** Translates a key, filling {placeholders}. */
  const t = (key: MessageKey, params?: Params) => tk(key, params);

  /** Like t() for keys built at runtime (e.g. `activity.${action}`); returns the key if it's unknown. */
  const tk = (key: string, params?: Params) => {
    const template = lookup(key, params);
    if (template === undefined) return key;
    return template.replace(/\{(\w+)\}/g, (_, name: string) => (params && name in params ? formatParam(params[name]) : `{${name}}`));
  };

  const has = (key: string) => lookup(key) !== undefined;

  /** Like t(), but placeholders can be React elements: rich("tip", { key: <kbd>K</kbd> }). */
  const rich = (key: MessageKey, params: Record<string, ReactNode | Param>): ReactNode => {
    const template = lookup(key, params) ?? key;
    const parts = template.split(/\{(\w+)\}/g);
    return createElement(
      Fragment,
      null,
      ...parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const value = params[part];
        const node = isValidElement(value) || Array.isArray(value) ? value : formatParam(value as Param);
        return createElement(Fragment, { key: i }, node as ReactNode);
      }),
    );
  };

  const list = (items: string[]) => new Intl.ListFormat(tag, { type: "conjunction" }).format(items);

  return { locale, tag, t, tk, has, rich, date, money, number, relative, list };
}

export type Translator = ReturnType<typeof createTranslator>;
