import { NextRequest, NextResponse } from "next/server";
import { getDailySeries, getKpis, type Filters } from "@/db/queries";

export const dynamic = "force-dynamic";

function readFilters(req: NextRequest): Filters {
  const sp = req.nextUrl.searchParams;
  return {
    restaurant: sp.get("restaurant") ?? undefined,
    startDate: sp.get("startDate") ?? undefined,
    endDate: sp.get("endDate") ?? undefined,
    evaluationStatus: sp.get("evaluationStatus") ?? undefined,
    scoreStatus: sp.get("scoreStatus") ?? undefined,
  };
}

export async function GET(req: NextRequest) {
  const f = readFilters(req);
  const kpis = await getKpis(f);
  const evals = await getDailySeries(f, "evals");
  const orders = await getDailySeries(f, "orders");
  const errors = await getDailySeries(f, "errors");

  function summarize(rows: { day: string; y: number }[]) {
    const ys = rows.map((r) => r.y);
    const total = ys.reduce((a, b) => a + b, 0);
    const peak = ys.length ? Math.max(...ys) : 0;
    const avg = ys.length ? Math.round(total / ys.length) : 0;
    return { total, avg, peak, data: rows };
  }

  return NextResponse.json({
    kpis,
    evals: summarize(evals),
    orders: summarize(orders),
    errors: summarize(errors),
  });
}
