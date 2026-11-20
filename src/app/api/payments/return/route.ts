import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { settleFinesOnline } from "@/lib/library";
import { getCurrentUser } from "@/lib/session";
import { paymentsEnabled, retrieveCheckoutSession } from "@/lib/stripe";

/**
 * Stripe sends the member here after Checkout. We look the session up with our secret key
 * (never trusting the URL alone), mark the fines paid, and go back to the member's fines.
 * The webhook does the same, so a closed tab still gets the payment recorded.
 */
export async function GET(req: NextRequest) {
  const back = (query: string) => NextResponse.redirect(new URL(`/loans?view=mine&${query}#fines`, req.url));
  const id = req.nextUrl.searchParams.get("session_id");
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (!id || !paymentsEnabled()) return back("payment=error");

  try {
    const session = await retrieveCheckoutSession(id);
    if (session.metadata.userId !== user.id) return back("payment=error");
    if (session.payment_status !== "paid") return back("payment=cancelled");
    const { settled } = await settleFinesOnline({
      libraryId: session.metadata.libraryId,
      userId: user.id,
      fineIds: (session.metadata.fineIds ?? "").split(",").filter(Boolean),
      paymentRef: session.id,
      amountPaidCents: session.amount_total ?? 0,
    });
    revalidatePath("/", "layout");
    return back(`paid=${settled}`);
  } catch (err) {
    console.error("[payments] return", err);
    return back("payment=error");
  }
}
