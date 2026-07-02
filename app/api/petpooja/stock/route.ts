import { NextRequest, NextResponse } from "next/server";
import { one, run } from "@/db/client";

export const dynamic = "force-dynamic";

// Petpooja "Update Item/addon In-Stock / Out-of-Stock" calls this endpoint to toggle an
// item's or add-on's availability. We store it as dishes.pp_active, which drives the
// green "Live" indicator on the Menu Library.
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "Nutriobox Petpooja stock (in/out of stock) webhook",
    message: "Petpooja toggles item/add-on availability here (POST).",
  });
}

function truthyStock(v: any): boolean {
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  // Petpooja sends true/false; be defensive about 1/0 and "2" (=out of stock) too.
  return !(s === "false" || s === "0" || s === "2" || s === "" || s === "out" || s === "outofstock");
}

function idList(v: any): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (v == null) return [];
  return String(v).split(",").map((x) => x.trim()).filter(Boolean);
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: 400, status: "failed", message: "invalid JSON" }, { status: 400 });
  }

  const restId = String(body?.restID ?? body?.restId ?? "");
  const type = String(body?.type ?? "item").toLowerCase();
  const inStock = truthyStock(body?.inStock);
  const ids = idList(body?.itemID ?? body?.itemid ?? body?.itemIDs);

  // Auth (same model as the menu push — Petpooja can't send our token):
  //   token (our own testing) OR whitelisted IP OR a known outlet restID.
  const expected = process.env.PETPOOJA_TOKEN || "";
  const tokenOk = !!expected && (body?.token === expected || req.nextUrl.searchParams.get("token") === expected);
  const allowIps = (process.env.PETPOOJA_MENU_IPS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const srcIp = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  const ipOk = allowIps.length > 0 && allowIps.includes(srcIp);
  const knownOutlet = restId ? await one<{ id: number }>(`SELECT id FROM restaurants WHERE pp_rest_id = ? LIMIT 1`, [restId]) : null;
  if (!tokenOk && !ipOk && !knownOutlet) {
    return NextResponse.json({ code: 400, status: "failed", message: "unauthorized" }, { status: 401 });
  }

  if (ids.length === 0) {
    return NextResponse.json({ code: 400, status: "failed", message: "no itemID provided" }, { status: 400 });
  }

  try {
    if (type === "addon") {
      // Add-ons: match by the Petpooja addon id we stored during menu sync.
      await run(`UPDATE dishes SET pp_active = ?, pp_active_at = now() WHERE pp_addon_id = ANY(?::text[])`, [inStock, ids]);
      await run(`UPDATE pp_menu_addons SET in_stock = ?, updated_at = now() WHERE addon_id = ANY(?::text[])`, [inStock, ids]);
    } else {
      // Items: match by the Petpooja item id (dishes.pp_item_id).
      await run(`UPDATE dishes SET pp_active = ?, pp_active_at = now() WHERE pp_item_id = ANY(?::text[])`, [inStock, ids]);
    }
  } catch (e: any) {
    return NextResponse.json({ code: 400, status: "failed", message: "update failed" }, { status: 500 });
  }

  return NextResponse.json({ code: 200, status: "success", message: `${type} ${inStock ? "in" : "out of"} stock: ${ids.length}` });
}
