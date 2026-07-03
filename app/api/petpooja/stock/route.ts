import { NextRequest, NextResponse } from "next/server";
import { q, one, run } from "@/db/client";

export const dynamic = "force-dynamic";

const PETPOOJA_IPS_DEFAULT = "18.140.101.169,13.215.101.248,13.229.16.157,18.140.106.48,13.234.181.90,35.154.180.221,122.179.153.230";

// Petpooja's item on/off (stock) webhook. Its real payload shape is:
//   { "restaurant_id": "136183", "status": "0" | "1",
//     "data": { "<menu-share-code>": [ { "item_id": "1287211681", "item_name": "" }, ... ] },
//     "from_date_time": "...", "to_date_time": "..." }
// status "1" = back IN stock, "0" = OUT of stock. The ids are Petpooja MENU item ids, which we
// map to our dishes by NAME via the latest stored menu push (dishes.pp_item_id is a different id).
// Every hit is logged to pp_menu_events (note prefix "stock") so toggles stay auditable.
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "Nutriobox Petpooja stock (in/out of stock) webhook",
    message: "Petpooja toggles item/add-on availability here (POST).",
  });
}

// status "1" = in stock, "0" = out. Fall back to the older { inStock } spec if status is absent.
function readInStock(body: any): boolean {
  if (body?.status !== undefined) return String(body.status).trim() === "1";
  const v = body?.inStock;
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  return !(s === "false" || s === "0" || s === "2" || s === "" || s === "out" || s === "outofstock");
}

// Collect item ids from data.<code>[].item_id, plus older flat { itemID } spec.
function extractIds(body: any): string[] {
  const ids = new Set<string>();
  const data = body?.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    for (const k of Object.keys(data)) {
      const arr = Array.isArray(data[k]) ? data[k] : [];
      for (const e of arr) {
        const id = String(e?.item_id ?? e?.itemid ?? e?.addonitemid ?? e?.addon_id ?? "").trim();
        if (id) ids.add(id);
      }
    }
  }
  const flat = body?.itemID ?? body?.itemid ?? body?.itemIDs;
  if (Array.isArray(flat)) for (const x of flat) { const s = String(x).trim(); if (s) ids.add(s); }
  else if (typeof flat === "string") for (const x of flat.split(",")) { const s = x.trim(); if (s) ids.add(s); }
  return [...ids];
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: 400, status: "failed", message: "invalid JSON" }, { status: 400 });
  }

  const restId = String(body?.restaurant_id ?? body?.restID ?? body?.restId ?? "");
  const inStock = readInStock(body);
  const ids = extractIds(body);

  // Auth: whitelisted Petpooja IP (they can't send our token) OR our own token for testing.
  const expected = process.env.PETPOOJA_TOKEN || "";
  const tokenOk = !!expected && (body?.token === expected || req.nextUrl.searchParams.get("token") === expected);
  const allowIps = (((process.env.PETPOOJA_MENU_IPS || "") + "," + PETPOOJA_IPS_DEFAULT)).split(",").map((s) => s.trim()).filter(Boolean);
  const srcIp = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "").split(",")[0].trim();
  const ipOk = !!srcIp && allowIps.includes(srcIp);

  // Log every hit (auditable). "stock" prefix keeps these rows out of the menu-view query.
  try {
    await run(
      `INSERT INTO pp_menu_events (rest_id, note, raw) VALUES (?, ?, ?)`,
      [restId, `stock ip=${srcIp} rest=${restId} inStock=${inStock} ids=${ids.join("|")} auth=${tokenOk || ipOk ? "ok" : "REJECT"}`, JSON.stringify(body)]
    );
  } catch { /* best-effort */ }

  if (!tokenOk && !ipOk) {
    return NextResponse.json({ code: 400, status: "failed", message: "unauthorized" }, { status: 401 });
  }
  if (ids.length === 0) {
    return NextResponse.json({ code: 400, status: "failed", message: "no item id" }, { status: 400 });
  }

  let matched = 0;
  try {
    // Map Petpooja menu item ids -> item names using the latest stored menu for this outlet.
    const ev = restId
      ? await one<{ raw: any }>(`SELECT raw FROM pp_menu_events WHERE note LIKE 'ok%' AND rest_id = ? ORDER BY received_at DESC LIMIT 1`, [restId])
      : await one<{ raw: any }>(`SELECT raw FROM pp_menu_events WHERE note LIKE 'ok%' ORDER BY received_at DESC LIMIT 1`, []);
    const root = ev?.raw?.properties ?? ev?.raw ?? {};
    const idToName: Record<string, string> = {};
    for (const it of Array.isArray(root.items) ? root.items : []) idToName[String(it?.itemid ?? "")] = String(it?.itemname ?? "").trim();
    const names = ids.map((id) => idToName[id]).filter(Boolean).map((n) => n.toLowerCase());

    // Apply to the matching dishes by name (drives the green Live / Not-live badge).
    if (names.length) {
      const updated = await q<{ id: number }>(
        `UPDATE dishes SET pp_active = ?, pp_active_at = now() WHERE lower(name) = ANY(?::text[]) RETURNING id`,
        [inStock, names]
      );
      matched += updated.length;
    }
    // Best-effort: if any id is actually an add-on id, apply that too.
    await run(`UPDATE dishes SET pp_active = ?, pp_active_at = now() WHERE pp_addon_id = ANY(?::text[])`, [inStock, ids]);
    await run(`UPDATE pp_menu_addons SET in_stock = ?, updated_at = now() WHERE addon_id = ANY(?::text[])`, [inStock, ids]);
  } catch {
    return NextResponse.json({ code: 400, status: "failed", message: "update failed" }, { status: 500 });
  }

  return NextResponse.json({ code: 200, status: "success", message: `${inStock ? "in" : "out of"} stock: matched ${matched} item(s)` });
}
