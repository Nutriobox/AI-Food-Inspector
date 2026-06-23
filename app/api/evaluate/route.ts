import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createEvaluation } from "@/db/queries";

const Schema = z.object({
  orderItemId: z.number().int().positive(),
  managerId: z.number().int().positive().optional(),
  score: z.number().min(0).max(100),
  status: z.enum(["Pass", "Warn", "Fail"]),
  weight_g: z.number().nullish(),
  temperature_c: z.number().nullish(),
  image: z.string().nullish(),
  notes: z.string().nullish(),
  tags: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  const id = await createEvaluation({
    orderItemId: parsed.data.orderItemId,
    managerId: parsed.data.managerId ?? null,
    score: parsed.data.score,
    status: parsed.data.status,
    weight_g: parsed.data.weight_g ?? null,
    temperature_c: parsed.data.temperature_c ?? null,
    image: parsed.data.image ?? null,
    notes: parsed.data.notes ?? null,
    tags: parsed.data.tags ?? [],
  });
  return NextResponse.json({ id });
}
