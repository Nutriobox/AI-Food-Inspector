import { NextResponse } from "next/server";
import { one } from "@/db/client";

export const dynamic = "force-dynamic";

// Petpooja ITEM stock code: "2" = in stock, "1"/"0" = out of stock.
function itemInStock(v: any): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return !(s === "1" || s === "0" || s === "false" || s === "out");
}
// Petpooja ADD-ON uses "active": "1" = available.
function addonInStock(v: any): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return !(s === "0" || s === "false" || s === "out");
}

// Returns the latest Petpooja menu (as they pushed it) structured for display.
export async function GET() {
  const ev = await one<{ raw: any; received_at: string; rest_id: string }>(
    `SELECT raw, received_at, rest_id FROM pp_menu_events WHERE note LIKE 'ok%' ORDER BY received_at DESC LIMIT 1`
  );
  if (!ev) {
    return NextResponse.json({ ok: true, synced: false, categories: [], addonGroups: [], counts: { items: 0, addons: 0 } });
  }
  const root = ev.raw?.properties ?? ev.raw ?? {};

  // category id -> { name, rank }
  const catMap: Record<string, { name: string; rank: number }> = {};
  for (const c of Array.isArray(root.categories) ? root.categories : []) {
    catMap[String(c?.categoryid ?? "")] = { name: String(c?.categoryname ?? "Uncategorised"), rank: Number(c?.categoryrank) || 0 };
  }

  // items grouped by category
  const byCat: Record<string, any[]> = {};
  for (const it of Array.isArray(root.items) ? root.items : []) {
    if (String(it?.active ?? "1") === "0") continue; // skip disabled items
    const cid = String(it?.item_categoryid ?? "");
    (byCat[cid] = byCat[cid] || []).push({
      id: String(it?.itemid ?? ""),
      name: String(it?.itemname ?? "").trim(),
      price: Number(it?.price) || 0,
      inStock: itemInStock(it?.in_stock),
      rank: Number(it?.itemrank) || 0,
    });
  }
  const categories = Object.entries(byCat)
    .map(([cid, items]) => ({
      id: cid,
      name: catMap[cid]?.name ?? "Other",
      rank: catMap[cid]?.rank ?? 999,
      items: items.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

  // add-on groups
  const addonGroups = (Array.isArray(root.addongroups) ? root.addongroups : [])
    .map((g: any) => ({
      id: String(g?.addongroupid ?? ""),
      name: String(g?.addongroup_name ?? "").trim(),
      rank: Number(g?.addongroup_rank) || 0,
      items: (Array.isArray(g?.addongroupitems) ? g.addongroupitems : [])
        .map((a: any) => ({
          id: String(a?.addonitemid ?? ""),
          name: String(a?.addonitem_name ?? "").trim(),
          price: Number(a?.addonitem_price) || 0,
          inStock: addonInStock(a?.active),
        }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name)),
    }))
    .filter((g: any) => g.items.length)
    .sort((a: any, b: any) => a.rank - b.rank || a.name.localeCompare(b.name));

  const itemCount = categories.reduce((n, c) => n + c.items.length, 0);
  const addonCount = addonGroups.reduce((n: number, g: any) => n + g.items.length, 0);

  return NextResponse.json({
    ok: true,
    synced: true,
    syncedAt: ev.received_at,
    restId: ev.rest_id,
    categories,
    addonGroups,
    counts: { items: itemCount, addons: addonCount },
  });
}
