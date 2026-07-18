import { NextRequest, NextResponse } from "next/server";
import { getOrderItemDetail } from "@/db/queries";
import { getRequestUser } from "@/lib/supabase/user";
import { one } from "@/db/client";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const detail = await getOrderItemDetail(id);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Outlet accounts must not be able to fetch items from another restaurant even
  // by guessing an item id. Look up the outlet's own restaurant name from
  // rest_id and compare against what the detail belongs to. Admins skip this.
  const user = await getRequestUser(req);
  const meta = (user?.user_metadata as any) || {};
  if (meta.role === "outlet") {
    const restId = String(meta.rest_id ?? "");
    const row = restId
      ? await one<{ name: string }>("SELECT name FROM restaurants WHERE pp_rest_id = ? LIMIT 1", [restId])
      : undefined;
    const ownRestaurant = row?.name ?? "__no_outlet_match__";
    if (String((detail as any).restaurant ?? "") !== ownRestaurant) {
      // Return 404 rather than 403 — don't confirm the item exists.
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  return NextResponse.json({
    ...detail,
    monitored_tags: JSON.parse(detail.monitored_tags || "[]"),
  });
}
