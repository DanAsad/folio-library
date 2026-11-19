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
  totalCopies: z.coerce.number().int().min(1, "There must be at least 1 copy.").max(999),
  location: optionalText,
});

export type BookInput = z.input<typeof bookInput>;
