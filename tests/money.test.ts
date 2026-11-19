import { describe, expect, it } from "vitest";
import { daysLate, formatMoney, overdueFineCents } from "@/lib/money";

const at = (iso: string) => new Date(iso);

describe("days late", () => {
  it("counts calendar days after the due date", () => {
    expect(daysLate(at("2026-03-10T15:00:00Z"), at("2026-03-10T23:59:00Z"))).toBe(0); // later the same day
    expect(daysLate(at("2026-03-10T15:00:00Z"), at("2026-03-11T00:01:00Z"))).toBe(1);
    expect(daysLate(at("2026-03-10T15:00:00Z"), at("2026-03-17T09:00:00Z"))).toBe(7);
    expect(daysLate(at("2026-03-10T15:00:00Z"), at("2026-03-01T09:00:00Z"))).toBe(0); // early
  });
});

describe("overdue fines", () => {
  const rules = { finePerDayCents: 25, fineGraceDays: 0, maxFineCents: 1000 };

  it("charges per day late", () => {
    expect(overdueFineCents(rules, at("2026-03-10T12:00:00Z"), at("2026-03-13T08:00:00Z"))).toBe(75);
  });

  it("skips the grace period", () => {
    expect(overdueFineCents({ ...rules, fineGraceDays: 2 }, at("2026-03-10T12:00:00Z"), at("2026-03-12T08:00:00Z"))).toBe(0);
    expect(overdueFineCents({ ...rules, fineGraceDays: 2 }, at("2026-03-10T12:00:00Z"), at("2026-03-15T08:00:00Z"))).toBe(75);
  });

  it("caps the total, and 0 means no cap", () => {
    expect(overdueFineCents(rules, at("2026-01-01T12:00:00Z"), at("2026-06-01T12:00:00Z"))).toBe(1000);
    expect(overdueFineCents({ ...rules, maxFineCents: 0 }, at("2026-01-01T12:00:00Z"), at("2026-02-10T12:00:00Z"))).toBe(40 * 25);
  });

  it("charges nothing when fines are turned off", () => {
    expect(overdueFineCents({ ...rules, finePerDayCents: 0 }, at("2026-01-01T12:00:00Z"), at("2026-02-01T12:00:00Z"))).toBe(0);
  });
});

describe("formatting", () => {
  it("formats cents in the library's currency", () => {
    expect(formatMoney(150)).toBe("$1.50");
    expect(formatMoney(2000, "EUR")).toBe("€20.00");
  });
});
