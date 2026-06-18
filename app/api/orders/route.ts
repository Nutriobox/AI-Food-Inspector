import { NextRequest, NextResponse } from "next/server";
import { getRecentOrders, type Filters } from "@/db/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const f: Filters = {
    restaurant: sp.get("restaurant") ?? undefined,
    startDate: sp.get("startDate") ?? undefined,
    endDate: sp.get("endDate") ?? undefined,
  };
  return NextResponse.json({ rows: getRecentOrders(f, 100) });
}
