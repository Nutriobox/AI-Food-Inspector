import { NextRequest, NextResponse } from "next/server";
import { getLiveOrders, getPastOrders } from "@/db/queries";
import { getRequestUser } from "@/lib/supabase/user";
import { one } from "@/db/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let restaurant = req.nextUrl.searchParams.get("restaurant") ?? undefined;
  const mode = req.nextUrl.searchParams.get("mode") ?? "live";

  // If an OUTLET account is signed in, force-filter to ONLY that outlet's restaurant
  // (so one outlet can never see another outlet's orders). Admins see what they request.
  //
  // NB: use getRequestUser (not createClient().auth.getUser()) — the latter only
  // reads cookies, which native/Bearer clients don't send. See lib/supabase/user.ts.
  const user = await getRequestUser(req);
  const meta = (user?.user_metadata as any) || {};
  if (meta.role === "outlet") {
    const restId = String(meta.rest_id ?? "");
    const row = restId
      ? await one<{ name: string }>("SELECT name FROM restaurants WHERE pp_rest_id = ? LIMIT 1", [restId])
      : undefined;
    restaurant = row?.name ?? "__no_outlet_match__";
  }

  const orders = mode === "past" ? await getPastOrders(restaurant) : await getLiveOrders(restaurant);
  return NextResponse.json({ orders });
}
