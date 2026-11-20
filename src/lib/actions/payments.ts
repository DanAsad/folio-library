"use server";

import { headers } from "next/headers";
import { getOpenFines, LibraryError } from "@/lib/library";
import { authorize } from "@/lib/session";
import { createCheckoutSession, paymentsEnabled } from "@/lib/stripe";
import { getI18n } from "@/i18n/server";
import { run } from "./result";

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return h.get("origin") ?? `${proto}://${host}`;
}

/** Starts a Stripe Checkout (test mode) for the member's unpaid fines; returns the page to send them to. */
export async function payFinesOnline() {
  return run(async () => {
    const user = await authorize();
    if (!paymentsEnabled()) throw new LibraryError("errors.paymentsOff");
    const open = await getOpenFines(user.library.id, user.id);
    if (!open.length) throw new LibraryError("errors.nothingToPay");

    const { t, locale } = await getI18n();
    const base = await origin();
    let session;
    try {
      session = await createCheckoutSession({
        lines: open.map((f) => ({
          name: [t(`fineReasons.${f.reason}`), f.loan?.book.title, user.library.name].filter(Boolean).join(" · "),
          amountCents: f.amountCents,
        })),
        currency: user.library.currency,
        fineIds: open.map((f) => f.id),
        userId: user.id,
        libraryId: user.library.id,
        successUrl: `${base}/api/payments/return?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${base}/loans?view=mine&payment=cancelled#fines`,
        locale,
      });
    } catch (err) {
      console.error("[payments]", err);
      throw new LibraryError("errors.paymentFailed");
    }
    if (!session.url) throw new LibraryError("errors.paymentFailed");
    return { data: { url: session.url } };
  });
}
