import { NextRequest, NextResponse } from "next/server";
import { one, run } from "@/db/client";

export const dynamic = "force-dynamic";

// Opening this URL in a browser is a GET -> friendly "alive" message.
// Petpooja's "Push Menu" API POSTs the full menu here after every menu change.
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "Nutriobox Petpooja menu sync (Push Menu)",
    message: "Petpooja pushes the menu here (POST). We store each add-on item's real price.",
  });
}

type AddonRow = { id: string; name: string; price: number; group: string };

// Push Menu format: add-on items live in `addongroupitems` (fields addonitemid /
// addonitem_name / addonitem_price / addongroup_id). Some accounts nest the items inside
// each `addongroups[]` entry instead. We handle both, and fall back to older field names.
function pickAddonItems(body: any): AddonRow[] {
  const root = body?.properties ?? body ?? {};
  const out: AddonRow[] = [];

  const pushItem = (it: any, group: string) => {
    const id = String(it?.addonitemid ?? it?.addongroupitemid ?? it?.addon_id ?? it?.id ?? "").trim();
    if (!id) return;
    const name = String(it?.addonitem_name ?? it?.addongroupitem_name ?? it?.name ?? "").trim();
    const price = Number(it?.addonitem_price ?? it?.addongroupitem_price ?? it?.price ?? 0) || 0;
    out.push({ id, name, price, group });
  };

  // Map addongroup id -> name, and collect any items nested inside groups.
  const groupName: Record<string, string> = {};
  const groups: any[] = Array.isArray(root?.addongroups) ? root.addongroups : [];
  for (const g of groups) {
    const gid = String(g?.addongroupid ?? g?.addongroup_id ?? "");
    const gname = String(g?.addongroup_name ?? g?.group_name ?? g?.name ?? "");
    if (gid) groupName[gid] = gname;
    const nested: any[] = Array.isArray(g?.addongroupitems) ? g.addongroupitems
      : Array.isArray(g?.addonitems) ? g.addonitems : [];
    for (const it of nested) pushItem(it, gname);
  }

  // Flat top-level addongroupitems array (the documented Push Menu shape).
  const flat: any[] = Array.isArray(root?.addongroupitems) ? root.addongroupitems : [];
  for (const it of flat) {
    const gid = String(it?.addongroup_id ?? it?.addongroupid ?? "");
    pushItem(it, groupName[gid] ?? "");
  }
  return out;
}

function restIdFrom(body: any): string {
  const root = body?.properties ?? body ?? {};
  const r = Array.isArray(root?.restaurants) ? root.restaurants[0] : root?.restaurants;
  return String(
    root?.restID ?? root?.restaurantid ?? r?.restaurantid ?? r?.res_id ?? r?.restID ?? ""
  );
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const restId = restIdFrom(body);
  const addons = pickAddonItems(body);

  // Auth model (Push Menu can't send our token):
  //   1) our token, if present (used for our own testing);
  //   2) source IP in the Petpooja allow-list (set PETPOOJA_MENU_IPS once Petpooja shares them);
  //   3) bootstrap: a well-formed menu whose restID maps to one of our known outlets.
  const expected = process.env.PETPOOJA_TOKEN || "";
  const tokenOk = !!expected && (body?.token === expected || req.nextUrl.searchParams.get("token") === expected);
  const allowIps = (process.env.PETPOOJA_MENU_IPS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const srcIp = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const ipOk = allowIps.length > 0 && allowIps.includes(srcIp);
  const knownOutlet = restId ? await one<{ id: number }>(`SELECT id FROM restaurants WHERE pp_rest_id = ? LIMIT 1`, [restId]) : null;
  const bootstrapOk = !!knownOutlet && addons.length > 0;

  if (!tokenOk && !ipOk && !bootstrapOk) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

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

  return NextResponse.json({ ok: true, restId, stored, addonsSeen: addons.length });
}
