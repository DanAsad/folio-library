import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Locale } from "@/i18n/config";

/**
 * Online fine payments through Stripe Checkout, called with plain fetch (no SDK). This demo only
 * accepts Stripe *test* keys (sk_test_…/rk_test_…), so no real money can ever move; members pay
 * with Stripe's test cards (4242 4242 4242 4242, any future date, any CVC).
 */
const API = "https://api.stripe.com/v1";

export function paymentsEnabled() {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  return /^(sk|rk)_test_/.test(key);
}

export type CheckoutSession = {
  id: string;
  url: string | null;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  amount_total: number | null;
  currency: string | null;
  metadata: Record<string, string>;
};

async function stripe<T>(path: string, init?: { method?: string; form?: URLSearchParams }): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(init?.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: init?.form?.toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${data?.error?.message ?? "request failed"}`);
  return data as T;
}

export async function createCheckoutSession(params: {
  lines: { name: string; amountCents: number }[];
  currency: string;
  fineIds: string[];
  userId: string;
  libraryId: string;
  successUrl: string;
  cancelUrl: string;
  locale: Locale;
}) {
  const form = new URLSearchParams({
    mode: "payment",
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    locale: params.locale,
    client_reference_id: params.userId,
    "metadata[userId]": params.userId,
    "metadata[libraryId]": params.libraryId,
    // Metadata values are limited to 500 characters: 13 UUIDs fit, and we pay at most 10 fines at once.
    "metadata[fineIds]": params.fineIds.join(","),
  });
  params.lines.forEach((line, i) => {
    form.set(`line_items[${i}][quantity]`, "1");
    form.set(`line_items[${i}][price_data][currency]`, params.currency.toLowerCase());
    form.set(`line_items[${i}][price_data][unit_amount]`, String(line.amountCents));
    form.set(`line_items[${i}][price_data][product_data][name]`, line.name.slice(0, 250));
  });
  return stripe<CheckoutSession>("/checkout/sessions", { method: "POST", form });
}

export const retrieveCheckoutSession = (id: string) => stripe<CheckoutSession>(`/checkout/sessions/${encodeURIComponent(id)}`);

/**
 * Checks a webhook's Stripe-Signature header (HMAC-SHA256 of "timestamp.payload") and rejects
 * events older than five minutes, as Stripe recommends.
 */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, now = Date.now()) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const timestamp = Number(parts.t);
  const signatures = header
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3));
  if (!timestamp || !signatures.length || Math.abs(now / 1000 - timestamp) > 300) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex"));
  return signatures.some((sig) => {
    const given = Buffer.from(sig);
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
