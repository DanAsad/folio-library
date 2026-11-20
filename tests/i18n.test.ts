import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MESSAGES, translatorFor } from "@/i18n";
import { LOCALES, negotiateLocale } from "@/i18n/config";
import { issue, translateIssue } from "@/i18n/issues";
import { english, renderStored, stored } from "@/i18n/stored";

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = "", out: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else flatten(v, key, out);
  }
  return out;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("translations", () => {
  const en = flatten(MESSAGES.en as unknown as Tree);

  for (const locale of LOCALES.filter((l) => l !== "en")) {
    it(`${locale} has every English message, with the same placeholders`, () => {
      const other = flatten(MESSAGES[locale] as unknown as Tree);
      expect(Object.keys(other).sort()).toEqual(Object.keys(en).sort());
      for (const [key, text] of Object.entries(en)) {
        // Plural forms may drop {count} ("once"), but must never invent placeholders.
        const allowed = new Set(placeholders(text));
        if (key.endsWith(".one") || key.endsWith(".other")) {
          const sibling = en[key.replace(/\.(one|other)$/, ".other")];
          placeholders(sibling).forEach((p) => allowed.add(p));
          allowed.add("count");
        }
        for (const p of placeholders(other[key])) expect(allowed, `${locale}:${key} uses {${p}}`).toContain(p);
        if (!/\.(one|other)$/.test(key)) expect(placeholders(other[key]), `${locale}:${key}`).toEqual(placeholders(text));
        expect(other[key].trim(), `${locale}:${key} is empty`).not.toBe("");
      }
    });
  }

  it("picks the visitor's language from Accept-Language", () => {
    expect(negotiateLocale("fr-CA,fr;q=0.9,en;q=0.8")).toBe("fr");
    expect(negotiateLocale("de-DE,de;q=0.9,it;q=0.5")).toBe("it");
    expect(negotiateLocale("es-MX")).toBe("es");
    expect(negotiateLocale("ja")).toBe("en");
    expect(negotiateLocale(null)).toBe("en");
  });

  it("formats plurals, money and dates for each language", () => {
    const en = translatorFor("en");
    const fr = translatorFor("fr");
    const es = translatorFor("es");
    expect(en.t("loans.dueInDays", { count: 1 })).toBe("Due in 1 day");
    expect(en.t("loans.dueInDays", { count: 3 })).toBe("Due in 3 days");
    expect(fr.t("loans.dueInDays", { count: 3 })).toBe("À rendre dans 3 jours");
    expect(fr.t("errors.finesBlock", { amount: { cents: 575, currency: "EUR" } })).toMatch(/5,75\s€/);
    expect(en.money(575, "USD")).toBe("$5.75");
    expect(es.date(new Date("2026-03-05T12:00:00Z"), "short", "UTC")).toMatch(/5 mar/);
    expect(translatorFor("it").relative(Date.now() - 5 * 86_400_000)).toBe("5 giorni fa");
  });

  it("fills placeholders with React elements in rich text", () => {
    const html = renderToStaticMarkup(createElement("p", null, translatorFor("en").rich("dashboard.blocked", { amount: createElement("strong", null, "$6.00") })));
    expect(html).toBe("<p>You owe <strong>$6.00</strong> in fines. Borrowing is paused until it&#x27;s settled at the desk.</p>");
  });

  it("stores database text as keys and shows it in the reader's language", () => {
    const text = stored("notify.holdReady.body", { library: "Central", date: new Date("2026-03-05T12:00:00Z") });
    expect(JSON.parse(JSON.stringify(text))).toEqual(text); // survives jsonb
    expect(english(text)).toBe("A copy is on the reserve shelf at Central until Mar 5.");
    expect(renderStored(translatorFor("fr"), text, "fallback")).toContain("jusqu'au 5 mars");
    expect(renderStored(translatorFor("fr"), null, "old English text")).toBe("old English text");
  });

  it("translates validation messages, including the field name", () => {
    const msg = issue("validation.atLeast", { field: "fields.loanDays", min: 1 });
    expect(translateIssue(translatorFor("en"), msg)).toBe("Loan period must be at least 1.");
    expect(translateIssue(translatorFor("it"), msg)).toBe("La durata del prestito deve essere almeno 1.");
    expect(translateIssue(translatorFor("es"), "Some custom text")).toBe("Some custom text");
  });
});
