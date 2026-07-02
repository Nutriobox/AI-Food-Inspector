import { NextRequest, NextResponse } from "next/server";
import { one, run } from "@/db/client";

export const dynamic = "force-dynamic";

// Opening this URL in a browser is a GET -> friendly "alive" message.
// Petpooja (or our own sync job) sends the menu here via POST.
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "Nutriobox Petpooja menu sync",
    message: "This endpoint stores the Petpooja menu (add-on item prices) via POST.",
  });
}

// Petpooja's menu JSON puts add-on items under addongroups[].addongroupitems[].
// Field names can vary slightly by account, so we read them defensively.
function pickAddonItems(body: any): { id: string; name: string; price: number; group: string }[] {
  const out: { id: string; name: string; price: number; group: string }[] = [];
  const groups: any[] = Array.isArray(body?.addongroups) ? body.addongroups
    : Array.isArray(body?.properties?.addongroups) ? body.properties.addongroups
    : Array.isArray(body?.menu?.addongroups) ? body.menu.addongroups
    : [];
  for (const g of groups) {
    const groupName = String(g?.addongroup_name ?? g?.group_name ?? g?.name ?? "");
    const gitems: any[] = Array.isArray(g?.addongroupitems) ? g.addongroupitems
      : Array.isArray(g?.addonitems) ? g.addonitems
      : Array.isArray(g?.items) ? g.items : [];
    for (const it of gitems) {
      const id = String(it?.addongroupitemid ?? it?.addonitemid ?? it?.addon_id ?? it?.id ?? "").trim();
      if (!id) continue;
      const name = String(it?.addongroupitem_name ?? it?.addonitem_name ?? it?.name ?? "").trim();
      const priceRaw = it?.addongroupitem_price ?? it?.addonitem_price ?? it?.price ?? 0;
      const price = Number(priceRaw) || 0;
      out.push({ id, name, price, group: groupName });
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  // Same shared secret as the order webhook.
  const expected = process.env.PETPOOJA_TOKEN || "";
  const tokenOk = !!expected && (body?.token === expected || req.nextUrl.searchParams.get("token") === expected);
  if (!tokenOk) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const restId = String(body?.restID ?? body?.restaurantid ?? body?.properties?.restID ?? "");
  const addons = pickAddonItems(body);
  if (addons.length === 0) {
    return NextResponse.json({ ok: true, note: "no add-on items found in payload", stored: 0 });
  }

  let stored = 0;
  for (const a of addons) {
    try {
      await run(
        `INSERT INTO pp_menu_addons (addon_id, name, price, group_name, rest_id, updated_at)
         VALUES (?, ?, ?, ?, ?, now())
         ON CONFLICT (addon_id) DO UPDATE
           SET name = EXCLUDED.name, price = EXCLUDED.price,
               group_name = EXCLUDED.group_name, rest_id = EXCLUDED.rest_id, updated_at = now()`,
        [a.id, a.name || null, a.price, a.group || null, restId || null]
      );
      stored++;
    } catch {
      // keep going; one bad row shouldn't fail the whole sync
    }
  }

  // Re-sync existing order lines so the camera reflects the real menu price immediately.
  // (Add-on order_items are matched to the menu by name; we never delete rows, so captured photos stay.)
  try {
    await run(
      `WITH menu AS (SELECT lower(name) AS nm, MAX(price) AS price FROM pp_menu_addons GROUP BY lower(name))
       UPDATE order_items t SET no_capture = (m.price = 0)
       FROM dishes d, menu m
       WHERE t.dish_id = d.id AND d.category IN ('Add-Ons','Extras') AND lower(d.name) = m.nm`,
      []
    );
  } catch {
    // re-sync is best-effort; storing the menu already succeeded
  }

  return NextResponse.json({ ok: true, stored, addonsSeen: addons.length });
}
