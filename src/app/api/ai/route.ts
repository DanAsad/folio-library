import { NextResponse } from "next/server";
import { z } from "zod";
import { aiEnabled } from "@/lib/ai";
import { getCurrentUser } from "@/lib/session";

/**
 * Thin proxy to a free, account-free, OpenAI-compatible chat endpoint. The default is
 * Pollinations' anonymous tier (open model GPT-OSS 20B): no sign-up, no API key, no cost.
 * It must be called from a server: browser requests are bot-protected.
 *
 * Swap the model with server env vars, e.g. a local Ollama:
 *   AI_CHAT_URL=http://localhost:11434/v1/chat/completions   AI_MODEL=llama3.2
 */
const CHAT_URL = process.env.AI_CHAT_URL || "https://text.pollinations.ai/openai";
const MODEL = process.env.AI_MODEL || "openai";

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string().max(40_000) }))
    .min(1)
    .max(42),
  json: z.boolean().optional(),
  stream: z.boolean().optional(),
});

// The free tier allows one reply every ~45 s per IP. Remember when it said to come back,
// so we can answer "busy" instantly instead of making the visitor wait for a refusal.
let blockedUntil = 0;

export async function POST(req: Request) {
  if (!(await getCurrentUser())) return NextResponse.json({ code: "signIn", error: "Please sign in." }, { status: 401 });
  if (!aiEnabled()) return NextResponse.json({ code: "off", error: "AI features are turned off on this site." }, { status: 503 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: "http", error: "Invalid AI request." }, { status: 400 });
  const totalChars = parsed.data.messages.reduce((n, m) => n + m.content.length, 0);
  if (totalChars > 80_000) return NextResponse.json({ code: "tooLong", error: "That conversation is too long. Start a new chat." }, { status: 413 });

  const wait = Math.ceil((blockedUntil - Date.now()) / 1000);
  if (wait > 0) return busy(wait);

  let upstream: Response;
  try {
    upstream = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: parsed.data.messages,
        ...(parsed.data.json ? { response_format: { type: "json_object" } } : {}),
        ...(parsed.data.stream ? { stream: true } : {}),
      }),
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(110_000)]),
    });
  } catch {
    return NextResponse.json({ code: "noResponse", error: "The free AI service didn't respond. Please try again in a moment." }, { status: 504 });
  }

  if (upstream.status === 402 || upstream.status === 429) {
    const text = await upstream.text().catch(() => "");
    const header = Number(upstream.headers.get("Retry-After"));
    const fromText = Number(text.match(/retry after (\d+)/i)?.[1]);
    const retry = header > 0 ? header : fromText > 0 ? fromText : 45;
    blockedUntil = Date.now() + retry * 1000;
    return busy(retry);
  }
  if (!upstream.ok || !upstream.body) {
    console.warn("[ai] upstream error", upstream.status);
    return NextResponse.json({ code: "http", error: `The free AI service had a problem (HTTP ${upstream.status}). Please try again shortly.` }, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? (parsed.data.stream ? "text/event-stream" : "application/json"),
      "Cache-Control": "no-store",
    },
  });
}

function busy(seconds: number) {
  return NextResponse.json(
    { code: "busy", error: `The free AI is busy (it allows one reply every 45 seconds). Try again in ${seconds}s.`, retryAfter: seconds },
    { status: 429, headers: { "Retry-After": String(seconds) } },
  );
}
