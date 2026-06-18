import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDishById, updateDish } from "@/db/queries";

export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  name: z.string().optional(),
  category: z.string().optional(),
  expected_grams: z.number().int().positive().optional(),
  monitored_tags: z.array(z.string()).optional(),
  reference_image: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  pp_item_id: z.string().nullable().optional(),
  swiggy_item_id: z.string().nullable().optional(),
  zomato_item_id: z.string().nullable().optional(),
  bench_garnish: z.string().nullable().optional(),
  bench_hygiene: z.string().nullable().optional(),
  bench_portion: z.string().nullable().optional(),
  bench_plating: z.string().nullable().optional(),
  ai_criteria: z.array(z.string()).nullable().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const dish = getDishById(id);
  if (!dish) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ dish });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  const updated = updateDish(id, parsed.data);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ dish: updated });
}
