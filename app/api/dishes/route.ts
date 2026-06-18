import { NextRequest, NextResponse } from "next/server";
import { getDishStats, listDishes, type Filters } from "@/db/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("mode") === "stats") {
    const f: Filters = {
      restaurant: sp.get("restaurant") ?? undefined,
      startDate: sp.get("startDate") ?? undefined,
      endDate: sp.get("endDate") ?? undefined,
    };
    return NextResponse.json({ rows: getDishStats(f) });
  }
  return NextResponse.json({ rows: listDishes() });
}
