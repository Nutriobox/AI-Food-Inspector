import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const ScoreSchema = z.object({
  image: z.string().min(1).max(8_000_000),
  criteria: z.array(z.string()).max(30).optional(),
  dishName: z.string().max(200).optional(),
  category: z.string().max(200).optional(),
  expectedGrams: z.number().optional(),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Retry on transient Gemini overload/rate-limit errors (503/429/500).
async function callGemini(url: string, payload: unknown, tries = 4): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) return res;
    last = res;
    if ((res.status === 503 || res.status === 429 || res.status === 500) && i < tries - 1) {
      await sleep(900 * (i + 1)); // 0.9s, 1.8s, 2.7s
      continue;
    }
    return res;
  }
  return last as Response;
}

export async function POST(req: NextRequest) {
  // This endpoint calls the paid Gemini API, so cap requests per IP.
  const rl = await rateLimit("score", clientIp(req), 60, 60);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests — please wait a few seconds and try again." }, { status: 429 });

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set. Add it to .env.local and restart the dev server." },
      { status: 400 }
    );
  }

  const parsedBody = ScoreSchema.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) return NextResponse.json({ error: "Invalid request: a valid image is required." }, { status: 400 });
  const body = parsedBody.data;

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s.exec(body.image);
  const mimeType = match ? match[1] : "image/jpeg";
  const data = match ? match[2] : body.image;

  const criteria = (body.criteria ?? []).map((c) => c.trim()).filter(Boolean);
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const prompt =
    `You are a strict food-quality inspector for the dish "${body.dishName ?? "this item"}"` +
    (body.category ? ` (category: ${body.category})` : "") +
    `.\nLook at the photo of the prepared item and judge it against each criterion.\n\n` +
    (criteria.length
      ? `Criteria:\n${criteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n\n`
      : `No specific criteria were provided. Judge the item on: correct dish, garnish/toppings, plating & presentation, and cleanliness.\n\n`) +
    `Also confirm whether the item in the photo actually matches the dish name above.\n` +
    `Respond ONLY with strict JSON in exactly this shape:\n` +
    `{"identifiedAs":"<what you think the dish is>","matchesExpected":true,` +
    `"criteria":[{"criterion":"<text>","pass":true,"reason":"<short reason>"}],` +
    `"overallScore":<integer 0-100>,"verdict":"Pass"|"Warn"|"Fail","summary":"<one line>"}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data } }] }],
    generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
  };

  let res: Response;
  try {
    res = await callGemini(url, payload);
  } catch {
    return NextResponse.json({ error: "Could not reach the Gemini API. Check your internet and try again." }, { status: 502 });
  }

  if (!res.ok) {
    const detail = await res.text();
    const friendly =
      res.status === 503 || res.status === 429
        ? "Gemini is busy right now (high demand). Please click Run AI check again in a few seconds."
        : `Gemini API error (${res.status})`;
    return NextResponse.json({ error: friendly, detail: detail.slice(0, 400) }, { status: 502 });
  }

  const json: any = await res.json();
  const text: string =
    json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";

  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        parsed = JSON.parse(m[0]);
      } catch {}
    }
  }
  if (!parsed) {
    return NextResponse.json({ error: "Could not parse the AI response", raw: text.slice(0, 400) }, { status: 502 });
  }

  return NextResponse.json({ result: parsed, model });
}
