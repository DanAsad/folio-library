import { z } from "zod";
import { issue } from "@/i18n/issues";
import type { MessageKey } from "@/i18n/translate";

// Error messages are message keys (see src/i18n/issues.ts), shown in the user's language.

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v ? v : null));

const optionalInt = (min: number, max: number, field: MessageKey) =>
  z
    .union([z.number(), z.string()])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === "" || v === null) return null;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: issue("validation.wholeBetween", { field, min, max }) });
        return z.NEVER;
      }
      return n;
    });

export const bookInput = z.object({
  title: z.string().trim().min(1, issue("validation.titleRequired")).max(300),
  author: z.string().trim().min(1, issue("validation.authorRequired")).max(300),
  isbn: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/[-\s]/g, "") : null))
    .refine((v) => v === null || /^(\d{9}[\dXx]|\d{13})$/.test(v), issue("validation.isbn")),
  genre: optionalText,
  tags: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) =>
      Array.from(
        new Set(
          (Array.isArray(v) ? v : (v ?? "").split(","))
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 12),
        ),
      ),
    ),
  publishedYear: optionalInt(0, new Date().getFullYear() + 1, "fields.year"),
  publisher: optionalText,
  pages: optionalInt(1, 20000, "fields.pages"),
  language: z.string().trim().max(60).optional().transform((v) => v || "English"),
  description: z.string().trim().max(5000).optional().transform((v) => v || null),
  coverUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^https?:\/\//.test(v), issue("validation.coverUrl")),
  /** Copies to create with a new book. Existing books manage copies individually. */
  copies: z.coerce.number().int().min(1, issue("validation.copiesMin")).max(50, issue("validation.copiesMax")).optional().default(1),
  location: optionalText,
});

const cents = (field: MessageKey) =>
  z
    .union([z.number(), z.string()])
    .transform((v, ctx) => {
      const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(n) || n < 0 || n > 1000) {
        ctx.addIssue({ code: "custom", message: issue("validation.amountRange", { field }) });
        return z.NEVER;
      }
      return Math.round(n * 100);
    });

const days = (field: MessageKey, min: number, max: number) =>
  z.coerce
    .number()
    .int(issue("validation.whole", { field }))
    .min(min, issue("validation.atLeast", { field, min }))
    .max(max, issue("validation.atMost", { field, max }));

/** Library settings form. Money is entered in currency units and stored as cents. */
export const librarySettingsInput = z.object({
  name: z.string().trim().min(2, issue("validation.nameRequired")).max(120),
  tagline: z.string().trim().max(200).optional().transform((v) => v || null),
  loanDays: days("fields.loanDays", 1, 120),
  maxLoans: days("fields.maxLoans", 1, 100),
  maxRenewals: days("fields.maxRenewals", 0, 10),
  holdPickupDays: days("fields.holdPickupDays", 1, 30),
  finePerDay: cents("fields.finePerDay"),
  fineGraceDays: days("fields.fineGraceDays", 0, 30),
  maxFine: cents("fields.maxFine"),
  lostItemFee: cents("fields.lostItemFee"),
  blockAt: cents("fields.blockAt"),
  currency: z.enum(["USD", "CAD", "EUR", "GBP"]),
});

export const newLibraryInput = z.object({
  name: z.string().trim().min(2, issue("validation.nameRequired")).max(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,5}$/, issue("validation.prefix")),
  tagline: z.string().trim().max(200).optional().transform((v) => v || null),
});

export const personInput = z.object({
  email: z.string().trim().toLowerCase().email(issue("validation.email")),
  name: z.string().trim().max(120).optional().transform((v) => v || null),
  role: z.enum(["admin", "librarian", "member"]),
});

export const fineInput = z.object({
  userId: z.string().uuid(),
  amount: cents("fields.amount").refine((c) => c > 0, issue("validation.amountPositive")),
  reason: z.enum(["damaged", "lost", "overdue"]),
  note: z.string().trim().max(300).optional(),
});

export type BookInput = z.input<typeof bookInput>;
