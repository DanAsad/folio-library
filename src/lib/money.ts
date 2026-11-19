// Money is stored as integer cents everywhere; these helpers are pure so the seed script,
// the server and the tests share exactly the same fine arithmetic.

const DAY = 24 * 60 * 60 * 1000;

export function formatMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export type FineRules = { finePerDayCents: number; fineGraceDays: number; maxFineCents: number };

const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/**
 * Calendar days past the due date (UTC), like a library counting days on the date stamp:
 * returning a book later on its due date is not late, the next day is 1 day late.
 */
export function daysLate(dueAt: Date, at: Date) {
  return Math.max(0, Math.round((utcDay(at) - utcDay(dueAt)) / DAY));
}

/** Overdue fine for a loan returned (or still out) at `at`: grace days are free, the total is capped. */
export function overdueFineCents(rules: FineRules, dueAt: Date, at: Date) {
  const billable = Math.max(0, daysLate(dueAt, at) - rules.fineGraceDays);
  const amount = billable * rules.finePerDayCents;
  return rules.maxFineCents > 0 ? Math.min(amount, rules.maxFineCents) : amount;
}
