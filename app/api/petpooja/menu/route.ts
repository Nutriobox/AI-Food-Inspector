import { NextRequest, NextResponse } from "next/server";
import { one, run } from "@/db/client";

export const dynamic = "force-dynamic";

// Opening this URL in a browser is a GET -> friendly "alive" message.
// Petpooja's "Push Menu" API POSTs the full menu here after every menu change.
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "Nutriobox Petpooja menu sync (Push Menu)",
    message: "Petpooja pushes the menu here (POST). We store add-on prices and item availability.",
  });
}

// Petpooja availability flags: true / "1" = live; false / "0" / "2" = not live.
function isActive(v: any): boolean {
  if (v == null) return true; // absent -> assume live
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  return !(s === "false" || s === "0" || s === "2" || s === "out" || s === "outofstock");
}

type AddonRow = { id: string; name: string; price: number; group: string; inStock: boolean };

// Add-on items live in `addongroupitems` (addonitemid / addonitem_name / addonitem_price /
// addongroup_id). Some accounts nest the items inside each `addongroups[]` entry instead.
function pickAddonItems(body: any): AddonRow[] {
  const root = body?.properties ?? body ?? {};
  const out: AddonRow[] = [];

  const pushItem = (it: any, group: string) => {
    const id = String(it?.addonitemid ?? it?.addongroupitemid ?? it?.addon_id ?? it?.id ?? "").trim();
    if (!id) return;
    const name = String(it?.addonitem_name ?? it?.addongroupitem_name ?? it?.name ?? "").trim();
    const price = Number(it?.addonitem_price ?? it?.addongroupitem_price ?? it?.price ?? 0) || 0;
    const inStock = isActive(it?.in_stock ?? it?.active ?? it?.status);
    out.push({ id, name, price, group, inStock });
  };

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
  const flat: any[] = Array.isArray(root?.addongroupitems) ? root.addongroupitems : [];
  for (const it of flat) {
    const gid = String(it?.addongroup_id ?? it?.addongroupid ?? "");
    pushItem(it, groupName[gid] ?? "");
  }
  return out;
}

// Regular menu items -> { id, active } (for dishes.pp_active).
function pickItems(body: any): { id: string; active: boolean }[] {
  const root = body?.properties ?? body ?? {};
  const items: any[] = Array.isArray(root?.items) ? root.items : [];
  const out: { id: string; active: boolean }[] = [];
  for (const it of items) {
    const id = String(it?.itemid ?? it?.item_id ?? it?.id ?? "").trim();
    if (!id) continue;
    out.push({ id, active: isActive(it?.in_stock ?? it?.active ?? it?.status) });
  }
  return out;
}

function restIdFrom(body: any): string {
  const root = body?.properties ?? body ?? {};
  const r = Array.isArray(root?.restaurants) ? root.restaurants[0] : root?.restaurants;
  return String(root?.restID ?? root?.restaurantid ?? r?.restaurantid ?? r?.res_id ?? r?.restID ?? "");
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
  const items = pickItems(body);

  // Auth (Push Menu can't send our token): token, OR whitelisted IP, OR a menu for a known outlet.
  const expected = process.env.PETPOOJA_TOKEN || "";
  const tokenOk = !!expected && (body?.token === expected || req.nextUrl.searchParams.get("token") === expected);
  const allowIps = (process.env.PETPOOJA_MENU_IPS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const srcIp = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const ipOk = allowIps.length > 0 && allowIps.includes(srcIp);
  const knownOutlet = restId ? await one<{ id: number }>(`SELECT id FROM restaurants WHERE pp_rest_id = ? LIMIT 1`, [restId]) : null;
  const bootstrapOk = !!knownOutlet && (addons.length > 0 || items.length > 0);
  if (!tokenOk && !ipOk && !bootstrapOk) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 1) Store add-on prices + availability.
  let stored = 0;
  for (const a of addons) {
    try {
      await run(
        `INSERT INTO pp_menu_addons (addon_id, name, price, group_name, rest_id, in_stock, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, now())
         ON CONFLICT (addon_id) DO UPDATE
           SET name = EXCLUDED.name, price = EXCLUDED.price, group_name = EXCLUDED.group_name,
               rest_id = EXCLUDED.rest_id, in_stock = EXCLUDED.in_stock, updated_at = now()`,
        [a.id, a.name || null, a.price, a.group || null, restId || null, a.inStock]
      );
      stored++;
    } catch { /* keep going */ }
  }

  // 2) Item availability -> dishes.pp_active (matched by Petpooja item id).
  const activeIds = items.filter((i) => i.active).map((i) => i.id);
  const offIds = items.filter((i) => !i.active).map((i) => i.id);
  try {
    if (activeIds.length) await run(`UPDATE dishes SET pp_active = true, pp_active_at = now() WHERE pp_item_id = ANY(?::text[])`, [activeIds]);
    if (offIds.length) await run(`UPDATE dishes SET pp_active = false, pp_active_at = now() WHERE pp_item_id = ANY(?::text[])`, [offIds]);
  } catch { /* best-effort */ }

  // 3) Link add-on dishes to their Petpooja addon id + availability (matched by name).
  try {
    await run(
      `UPDATE dishes d
         SET pp_addon_id = m.addon_id, pp_active = m.in_stock, pp_active_at = now()
       FROM pp_menu_addons m
       WHERE d.category IN ('Add-Ons','Extras') AND lower(d.name) = lower(m.name)`,
      []
    );
  } catch { /* best-effort */ }

  // 4) Re-sync the camera flag from real add-on prices (price 0 -> no camera).
  try {
    await run(
      `WITH menu AS (SELECT lower(name) AS nm, MAX(price) AS price FROM pp_menu_addons GROUP BY lower(name))
       UPDATE order_items t SET no_capture = (m.price = 0)
       FROM dishes d, menu m
       WHERE t.dish_id = d.id AND d.category IN ('Add-Ons','Extras') AND lower(d.name) = m.nm`,
      []
    );
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, restId, addonsStored: stored, itemsSeen: items.length });
}
