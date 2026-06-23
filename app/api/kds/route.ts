import { NextRequest, NextResponse } from "next/server";
import { getLiveOrders, getPastOrders } from "@/db/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const restaurant = req.nextUrl.searchParams.get("restaurant") ?? undefined;
  const mode = req.nextUrl.searchParams.get("mode") ?? "live";
  const orders = mode === "past" ? await getPastOrders(restaurant) : await getLiveOrders(restaurant);
  return NextResponse.json({ orders });
}
