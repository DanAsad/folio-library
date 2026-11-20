"use client";

import { useTransition } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { payFinesOnline } from "@/lib/actions/payments";
import { useI18n } from "@/i18n/client";

/** Sends the member to Stripe Checkout (test mode) to pay their unpaid fines. */
export function PayFinesButton({ amount }: { amount: string }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-1">
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await payFinesOnline();
            if (res.ok && res.data?.url) window.location.assign(res.data.url);
            else if (!res.ok) toast.error(res.error);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <CreditCard />}
        {t("payments.payOnline", { amount })}
      </Button>
      <p className="text-xs text-muted-foreground">{t("payments.testHint")}</p>
    </div>
  );
}
