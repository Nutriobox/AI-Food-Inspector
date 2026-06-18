import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateOrderStatus } from "@/db/queries";

const Schema = z.object({
  orderId: z.number().int().positive(),
  status: z.enum(["pending", "cooking", "plating", "ready", "served"]),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  updateOrderStatus(parsed.data.orderId, parsed.data.status);
  return NextResponse.json({ ok: true });
}
