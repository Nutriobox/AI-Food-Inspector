import { NextRequest, NextResponse } from "next/server";
import { run } from "@/db/client";

export const dynamic = "force-dynamic";

// Petpooja's published source IPs for menu/stock pushes (they can't send our token).
// Extra IPs can be added via the PETPOOJA_MENU_IPS env var.
const PETPOOJA_IPS_DEFAULT = "18.140.101.169,13.215.101.248,13.229.16.157,18.140.106.48,13.234.181.90,35.154.180.221";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "Nutriobox Petpooja menu sync (Push Menu)",
    message: "Petpooja pushes the menu here (POST). We store add-on prices and item availability.",
  });
}

// Petpooja availability flags: true / "1" = live; false / "0" / "2" = not live.
function isActive(v: any): boolean {
  if (v == null) return true;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  return !(s === "false" || s === "0" || s === "2" || s === "out" || s === "outofstock");
}

type AddonRow = { id: string; name: string; price: number; group: string; inStock: boolean };

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

  // Auth: our token (testing) OR the request came from a whitelisted Petpooja IP.
  const expected = process.env.PETPOOJA_TOKEN || "";
  const tokenOk = !!expected && (body?.token === expected || req.nextUrl.searchParams.get("token") === expected);
  const allowIps = ((process.env.PETPOOJA_MENU_IPS || "") + "," + PETPOOJA_IPS_DEFAULT).split(",").map((s) => s.trim()).filter(Boolean);
  const srcIp = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "").split(",")[0].trim();
  const ipOk = !!srcIp && allowIps.includes(srcIp);

  if (!tokenOk && !ipOk) {
    try { await run(`INSERT INTO pp_menu_events (rest_id, note, raw) VALUES (?, ?, ?)`, [restId, `REJECTED 401 ip=${srcIp}`, JSON.stringify(body)]); } catch {}
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // Log the accepted menu push (so we can confirm Petpooja's exact format).
  try { await run(`INSERT INTO pp_menu_events (rest_id, note, raw) VALUES (?, ?, ?)`, [restId, `ok ip=${srcIp} addons:${addons.length} items:${items.length}`, JSON.stringify(body)]); } catch {}

  // 1) Add-on prices + availability.
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
