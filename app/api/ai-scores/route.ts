import { NextRequest, NextResponse } from "next/server";
import { insertAiScore, listAiScores } from "@/db/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ rows: await listAiScores(25) });
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  const id = await insertAiScore({
    dish_id: typeof b.dishId === "number" ? b.dishId : null,
    dish_name: b.dishName ?? null,
    score: typeof b.score === "number" ? b.score : null,
    verdict: b.verdict ?? null,
    identified_as: b.identifiedAs ?? null,
    matches_expected: b.matchesExpected ? 1 : 0,
    summary: b.summary ?? null,
    criteria_json: Array.isArray(b.criteria) ? JSON.stringify(b.criteria) : null,
  });
  return NextResponse.json({ id });
}
