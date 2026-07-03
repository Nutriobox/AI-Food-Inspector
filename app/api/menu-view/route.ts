import { NextResponse } from "next/server";
import { one } from "@/db/client";

export const dynamic = "force-dynamic";

// Sub-brand items/categories carry a [SB] or [SBN] tag -> not NutrioBox, never shown.
const SB = /\[(sb|sbn)\]/i;

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

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
}

// Latest Petpooja menu, structured. Categories / add-on groups are grouped by NAME,
// so Petpooja's duplicate-named categories (e.g. two "Breads") merge into one section.
export async function GET() {
  const ev = await one<{ raw: any; received_at: string; rest_id: string }>(
    `SELECT raw, received_at, rest_id FROM pp_menu_events WHERE note LIKE 'ok%' ORDER BY received_at DESC LIMIT 1`
  );
  if (!ev) {
    return NextResponse.json({ ok: true, synced: false, categories: [], addonGroups: [], counts: { items: 0, addons: 0 } });
  }
  const root = ev.raw?.properties ?? ev.raw ?? {};

  const catMap: Record<string, { name: string; rank: number }> = {};
  for (const c of Array.isArray(root.categories) ? root.categories : []) {
    catMap[String(c?.categoryid ?? "")] = { name: String(c?.categoryname ?? "Uncategorised").trim(), rank: Number(c?.categoryrank) || 0 };
  }

  const byName: Record<string, { name: string; rank: number; items: any[] }> = {};
  for (const it of Array.isArray(root.items) ? root.items : []) {
    if (String(it?.active ?? "1") === "0") continue;
    const cat = catMap[String(it?.item_categoryid ?? "")];
    const catName = cat?.name ?? "Other";
    if (SB.test(String(it?.itemname ?? "")) || SB.test(catName)) continue;
    const topPrice = Number(it?.price) || 0;
    const vPrices = (Array.isArray(it?.variation) ? it.variation : []).map((v: any) => Number(v?.price) || 0).filter((n: number) => n > 0);
    const prices = topPrice > 0 ? [topPrice] : vPrices;
    const g = byName[catName] || (byName[catName] = { name: catName, rank: cat?.rank ?? 999, items: [] });
    g.rank = Math.min(g.rank, cat?.rank ?? 999);
    g.items.push({
      id: String(it?.itemid ?? ""),
      name: String(it?.itemname ?? "").trim(),
      priceFrom: prices.length ? Math.min(...prices) : 0,
      priceTo: prices.length ? Math.max(...prices) : 0,
      inStock: itemInStock(it?.in_stock),
      rank: Number(it?.itemrank) || 0,
    });
  }
  const categories = Object.values(byName)
    .filter((c) => !SB.test(c.name))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .map((c, i) => ({ id: `c${i}-${slug(c.name)}`, name: c.name, items: c.items.sort((a: any, b: any) => a.rank - b.rank || a.name.localeCompare(b.name)) }));

  const byGroup: Record<string, { name: string; rank: number; items: any[] }> = {};
  for (const gg of Array.isArray(root.addongroups) ? root.addongroups : []) {
    const gname = String(gg?.addongroup_name ?? "").trim();
    if (!gname || SB.test(gname)) continue;
    const grank = Number(gg?.addongroup_rank) || 0;
    const g = byGroup[gname] || (byGroup[gname] = { name: gname, rank: grank, items: [] });
    g.rank = Math.min(g.rank, grank);
    for (const a of Array.isArray(gg?.addongroupitems) ? gg.addongroupitems : []) {
      const an = String(a?.addonitem_name ?? "").trim();
      if (!an || SB.test(an)) continue;
      const p = Number(a?.addonitem_price) || 0;
      g.items.push({ id: String(a?.addonitemid ?? ""), name: an, priceFrom: p, priceTo: p, inStock: addonInStock(a?.active) });
    }
  }
  const addonGroups = Object.values(byGroup)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .map((g, i) => ({ id: `a${i}-${slug(g.name)}`, name: g.name, items: g.items.sort((a: any, b: any) => a.name.localeCompare(b.name)) }))
    .filter((g) => g.items.length);

  const itemCount = categories.reduce((n, c) => n + c.items.length, 0);
  const addonCount = addonGroups.reduce((n: number, g: any) => n + g.items.length, 0);

  return NextResponse.json({ ok: true, synced: true, syncedAt: ev.received_at, restId: ev.rest_id, categories, addonGroups, counts: { items: itemCount, addons: addonCount } });
}
