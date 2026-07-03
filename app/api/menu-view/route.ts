import { NextResponse } from "next/server";
import { q } from "@/db/client";

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

type ItemAgg = { id: string; name: string; prices: Set<number>; inStock: boolean; rank: number; outlets: Set<string> };
type Bucket = { name: string; rank: number; items: Record<string, ItemAgg> };

// Unified NutrioBox menu: takes the LATEST menu push from EVERY outlet and merges them.
// Same-named categories, items and add-ons are combined across all outlets, so a dish that
// exists at several outlets appears once. Price becomes a range when outlets differ, and an
// item is "in stock" if it is in stock at any outlet. Sub-brand [SB]/[SBN] entries are excluded.
export async function GET() {
  const rows = await q<{ raw: any; received_at: string; rest_id: string }>(
    `SELECT DISTINCT ON (rest_id) rest_id, raw, received_at
       FROM pp_menu_events
      WHERE note LIKE 'ok%'
      ORDER BY rest_id, received_at DESC`
  );
  if (!rows.length) {
    return NextResponse.json({ ok: true, synced: false, outletCount: 0, categories: [], addonGroups: [], counts: { items: 0, addons: 0 } });
  }

  const catByName: Record<string, Bucket> = {};
  const groupByName: Record<string, Bucket> = {};
  let latest = rows[0].received_at;

  const addItem = (
    bucketMap: Record<string, Bucket>,
    bucketName: string,
    bucketRank: number,
    it: { id: string; name: string; prices: number[]; inStock: boolean; rank: number },
    outlet: string
  ) => {
    const bKey = bucketName.toLowerCase();
    const b = bucketMap[bKey] || (bucketMap[bKey] = { name: bucketName, rank: bucketRank, items: {} });
    b.rank = Math.min(b.rank, bucketRank);
    const iKey = it.name.toLowerCase();
    const agg = b.items[iKey] || (b.items[iKey] = { id: it.id || iKey, name: it.name, prices: new Set<number>(), inStock: false, rank: it.rank, outlets: new Set<string>() });
    for (const p of it.prices) if (p > 0) agg.prices.add(p);
    agg.inStock = agg.inStock || it.inStock;
    if (outlet) agg.outlets.add(outlet);
  };

  for (const ev of rows) {
    if (ev.received_at > latest) latest = ev.received_at;
    const root = ev.raw?.properties ?? ev.raw ?? {};
    const outlet = String(ev.rest_id ?? "");

    // categoryid -> { name, rank } for this outlet
    const catMap: Record<string, { name: string; rank: number }> = {};
    for (const c of Array.isArray(root.categories) ? root.categories : []) {
      catMap[String(c?.categoryid ?? "")] = { name: String(c?.categoryname ?? "Uncategorised").trim(), rank: Number(c?.categoryrank) || 0 };
    }

    for (const it of Array.isArray(root.items) ? root.items : []) {
      if (String(it?.active ?? "1") === "0") continue; // disabled item
      const cat = catMap[String(it?.item_categoryid ?? "")];
      const catName = cat?.name ?? "Other";
      const name = String(it?.itemname ?? "").trim();
      if (!name || SB.test(name) || SB.test(catName)) continue;
      const topPrice = Number(it?.price) || 0;
      const vPrices = (Array.isArray(it?.variation) ? it.variation : []).map((v: any) => Number(v?.price) || 0).filter((n: number) => n > 0);
      const prices = topPrice > 0 ? [topPrice] : vPrices;
      addItem(catByName, catName, cat?.rank ?? 999, { id: String(it?.itemid ?? ""), name, prices, inStock: itemInStock(it?.in_stock), rank: Number(it?.itemrank) || 0 }, outlet);
    }

    for (const gg of Array.isArray(root.addongroups) ? root.addongroups : []) {
      const gname = String(gg?.addongroup_name ?? "").trim();
      if (!gname || SB.test(gname)) continue;
      const grank = Number(gg?.addongroup_rank) || 0;
      for (const a of Array.isArray(gg?.addongroupitems) ? gg.addongroupitems : []) {
        const an = String(a?.addonitem_name ?? "").trim();
        if (!an || SB.test(an)) continue;
        const p = Number(a?.addonitem_price) || 0;
        addItem(groupByName, gname, grank, { id: String(a?.addonitemid ?? ""), name: an, prices: [p], inStock: addonInStock(a?.active), rank: 0 }, outlet);
      }
    }
  }

  const buildItems = (items: Record<string, ItemAgg>) =>
    Object.values(items)
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
      .map((it) => {
        const ps = [...it.prices];
        return { id: it.id, name: it.name, priceFrom: ps.length ? Math.min(...ps) : 0, priceTo: ps.length ? Math.max(...ps) : 0, inStock: it.inStock, outlets: it.outlets.size };
      });

  const categories = Object.values(catByName)
    .filter((c) => !SB.test(c.name))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .map((c, i) => ({ id: `c${i}-${slug(c.name)}`, name: c.name, items: buildItems(c.items) }))
    .filter((c) => c.items.length);

  const addonGroups = Object.values(groupByName)
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .map((g, i) => ({ id: `a${i}-${slug(g.name)}`, name: g.name, items: buildItems(g.items) }))
    .filter((g) => g.items.length);

  const itemCount = categories.reduce((n, c) => n + c.items.length, 0);
  const addonCount = addonGroups.reduce((n, g) => n + g.items.length, 0);

  return NextResponse.json({
    ok: true,
    synced: true,
    syncedAt: latest,
    outletCount: rows.length,
    categories,
    addonGroups,
    counts: { items: itemCount, addons: addonCount },
  });
}
