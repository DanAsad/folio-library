import { NextResponse } from "next/server";
import { toCsv } from "@/lib/csv";
import { daysLate } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { getFineRows, getLoanRows, getReport, REPORT_RANGES, type ReportRange } from "@/lib/stats";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const amount = (cents: number) => (cents / 100).toFixed(2);

/** CSV exports for the reports page: summary, loans or fines for the current library. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "reports:view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const params = new URL(req.url).searchParams;
  const type = params.get("type") ?? "summary";
  const requested = Number(params.get("range"));
  const days: ReportRange = (REPORT_RANGES as readonly number[]).includes(requested) ? (requested as ReportRange) : 90;
  const lib = user.library;

  let rows: (string | number | null)[][];
  if (type === "loans") {
    const loans = await getLoanRows(lib.id, days);
    rows = [
      ["borrowed", "due", "returned", "days_late", "renewals", "title", "author", "barcode", "member", "email"],
      ...loans.map((l) => [
        iso(l.borrowedAt),
        iso(l.dueAt),
        iso(l.returnedAt),
        daysLate(l.dueAt, l.returnedAt ?? new Date()),
        l.renewals,
        l.title,
        l.author,
        l.barcode,
        l.member,
        l.email,
      ]),
    ];
  } else if (type === "fines") {
    const fines = await getFineRows(lib.id, days);
    rows = [
      ["charged", `amount_${lib.currency.toLowerCase()}`, "reason", "status", "settled", "member", "email", "note"],
      ...fines.map((f) => [iso(f.createdAt), amount(f.amountCents), f.reason, f.status, iso(f.resolvedAt), f.member, f.email, f.note]),
    ];
  } else {
    const r = await getReport(lib.id, days);
    rows = [
      [r.bucket, "loans", "late_loans", `fines_charged_${lib.currency.toLowerCase()}`],
      ...r.periods.map((p) => [p.period, p.loans, p.late, amount(p.finesCents)]),
      [],
      ["metric", "value"],
      ["loans", r.summary.loans],
      ["borrowers", r.summary.borrowers],
      ["returns", r.summary.returns],
      ["late_return_rate_percent", r.summary.lateRate],
      ["average_loan_days", r.summary.avgLoanDays],
      ["new_members", r.summary.newMembers],
      ["fines_charged", amount(r.summary.finesCharged)],
      ["fines_collected", amount(r.summary.finesCollected)],
      ["fines_waived", amount(r.summary.finesWaived)],
      ["fines_outstanding", amount(r.summary.finesOutstanding)],
      ["copies_in_circulation", r.collection.active],
      ["copies_lost", r.collection.lost],
      ["copies_withdrawn", r.collection.withdrawn],
    ];
  }

  const name = `folio-${lib.slug}-${type}-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse("﻿" + toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
  });
}
