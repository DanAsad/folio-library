import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v ? v : null));

const optionalInt = (min: number, max: number, label: string) =>
  z
    .union([z.number(), z.string()])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === "" || v === null) return null;
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: `${label} must be a whole number between ${min} and ${max}.` });
        return z.NEVER;
      }
      return n;
    });

export const bookInput = z.object({
  title: z.string().trim().min(1, "Title is required.").max(300),
  author: z.string().trim().min(1, "Author is required.").max(300),
  isbn: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/[-\s]/g, "") : null))
    .refine((v) => v === null || /^(\d{9}[\dXx]|\d{13})$/.test(v), "ISBN must have 10 or 13 digits."),
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
  publishedYear: optionalInt(0, new Date().getFullYear() + 1, "Year"),
  publisher: optionalText,
  pages: optionalInt(1, 20000, "Pages"),
  language: z.string().trim().max(60).optional().transform((v) => v || "English"),
  description: z.string().trim().max(5000).optional().transform((v) => v || null),
  coverUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^https?:\/\//.test(v), "Cover must be an http(s) URL."),
  /** Copies to create with a new book. Existing books manage copies individually. */
  copies: z.coerce.number().int().min(1, "There must be at least 1 copy.").max(50, "Add at most 50 copies at once.").optional().default(1),
  location: optionalText,
});

const cents = (label: string) =>
  z
    .union([z.number(), z.string()])
    .transform((v, ctx) => {
      const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(n) || n < 0 || n > 1000) {
        ctx.addIssue({ code: "custom", message: `${label} must be an amount between 0 and 1,000.` });
        return z.NEVER;
      }
      return Math.round(n * 100);
    });

const days = (label: string, min: number, max: number) =>
  z.coerce.number().int(`${label} must be a whole number.`).min(min, `${label} must be at least ${min}.`).max(max, `${label} can be at most ${max}.`);

/** Library settings form. Money is entered in currency units and stored as cents. */
export const librarySettingsInput = z.object({
  name: z.string().trim().min(2, "Name is required.").max(120),
  tagline: z.string().trim().max(200).optional().transform((v) => v || null),
  loanDays: days("Loan period", 1, 120),
  maxLoans: days("Loan limit", 1, 100),
  maxRenewals: days("Renewals", 0, 10),
  holdPickupDays: days("Pickup window", 1, 30),
  finePerDay: cents("Daily fine"),
  fineGraceDays: days("Grace period", 0, 30),
  maxFine: cents("Maximum fine"),
  lostItemFee: cents("Lost-item fee"),
  blockAt: cents("Blocking limit"),
  currency: z.enum(["USD", "CAD", "EUR", "GBP"]),
});

export const newLibraryInput = z.object({
  name: z.string().trim().min(2, "Name is required.").max(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,5}$/, "Use 2 to 5 letters for the barcode prefix."),
  tagline: z.string().trim().max(200).optional().transform((v) => v || null),
});

export const personInput = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  name: z.string().trim().max(120).optional().transform((v) => v || null),
  role: z.enum(["admin", "librarian", "member"]),
});

export const fineInput = z.object({
  userId: z.string().uuid(),
  amount: cents("Amount").refine((c) => c > 0, "Amount must be more than zero."),
  reason: z.enum(["damaged", "lost", "overdue"]),
  note: z.string().trim().max(300).optional(),
});

export type BookInput = z.input<typeof bookInput>;
