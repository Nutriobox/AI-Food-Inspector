import { NextRequest, NextResponse } from "next/server";
import { getOrderItemDetail } from "@/db/queries";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const detail = await getOrderItemDetail(id);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    ...detail,
    monitored_tags: JSON.parse(detail.monitored_tags || "[]"),
  });
}
