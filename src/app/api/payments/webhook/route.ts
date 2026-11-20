import { NextResponse } from "next/server";
import { settleFinesOnline } from "@/lib/library";
import { verifyStripeSignature, type CheckoutSession } from "@/lib/stripe";

/**
 * Optional Stripe webhook (set STRIPE_WEBHOOK_SECRET and point a webhook for
 * checkout.session.completed at /api/payments/webhook). It records payments even when the
 * member closes the tab before returning to the site. Safe to receive twice.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured." }, { status: 404 });
  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }
  const event = JSON.parse(payload) as { type: string; data: { object: CheckoutSession } };
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    if (session.payment_status === "paid" && session.metadata?.userId && session.metadata.libraryId) {
      await settleFinesOnline({
        libraryId: session.metadata.libraryId,
        userId: session.metadata.userId,
        fineIds: (session.metadata.fineIds ?? "").split(",").filter(Boolean),
        paymentRef: session.id,
        amountPaidCents: session.amount_total ?? 0,
      });
    }
  }
  return NextResponse.json({ received: true });
}
