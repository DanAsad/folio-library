// Optional email delivery. In-app notifications always work; email is sent only when
// RESEND_API_KEY and EMAIL_FROM are set (https://resend.com has a free tier). Any other
// provider can be swapped in here.

const PLACEHOLDER_DOMAINS = ["example.com", "example.org", "test.local", "localhost"];

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** Demo and test accounts use reserved domains that must never receive real mail. */
export function isDeliverable(address: string) {
  const domain = address.split("@")[1]?.toLowerCase() ?? "";
  return Boolean(domain) && !PLACEHOLDER_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string }) {
  if (!emailConfigured() || !isDeliverable(to)) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to, subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("Email failed", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (err) {
    console.error("Email failed", err);
    return false;
  }
}
