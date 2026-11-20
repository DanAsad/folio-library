import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { paymentsEnabled, verifyStripeSignature } from "@/lib/stripe";

const sign = (payload: string, secret: string, t: number) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;

describe("Stripe", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("only turns on with a test key, so no real money can move", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(paymentsEnabled()).toBe(false);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_abc");
    expect(paymentsEnabled()).toBe(false);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_abc");
    expect(paymentsEnabled()).toBe(true);
  });

  it("accepts genuine webhook signatures and rejects forged or stale ones", () => {
    const secret = "whsec_test";
    const body = JSON.stringify({ type: "checkout.session.completed" });
    const now = Date.now();
    const t = Math.floor(now / 1000);

    expect(verifyStripeSignature(body, sign(body, secret, t), secret, now)).toBe(true);
    expect(verifyStripeSignature(body, sign(body, "whsec_other", t), secret, now)).toBe(false);
    expect(verifyStripeSignature(body + " ", sign(body, secret, t), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, sign(body, secret, t - 600), secret, now)).toBe(false);
    expect(verifyStripeSignature(body, null, secret, now)).toBe(false);
  });
});
