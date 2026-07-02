import { NextRequest, NextResponse } from "next/server";
import { q, one, run } from "@/db/client";

export const dynamic = "force-dynamic";

// Opening this URL in a browser is a GET -> show a friendly "alive" message
// instead of an error. Petpooja sends real orders via POST.
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "Nutriobox Petpooja order webhook",
    message: "This endpoint is live. It only receives orders from Petpooja via POST.",
  });
}

function channelFrom(orderFrom?: string): string {
  const f = (orderFrom || "").toLowerCase();
  if (f.includes("swiggy")) return "Swiggy";
  if (f.includes("zomato")) return "Zomato";
  return "POS";
}

export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const props = body?.properties ?? {};
  const rest = props?.Restaurant ?? {};
  const order = props?.Order ?? {};
  const cust = props?.Customer ?? {};
  const items: any[] = Array.isArray(props?.OrderItem) ? props.OrderItem : [];

  const restId = String(rest?.restID ?? "");
  const ppOrderId = String(order?.orderID ?? order?.customer_invoice_id ?? "");
  const channel = channelFrom(order?.order_from);

  const expected = process.env.PETPOOJA_TOKEN || "";
  const tokenOk = !!expected && body?.token === expected;

  // Always capture the raw event first (so we can inspect every incoming order).
  let eventId: number | undefined;
  try {
    const ev = await one<{ id: number }>(
      `INSERT INTO petpooja_events (token_ok, rest_id, pp_order_id, channel, raw)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
      [tokenOk, restId, ppOrderId, channel, JSON.stringify(body)]
    );
    eventId = ev?.id;
  } catch (e: any) {
    // capture failure shouldn't block the response logic below
  }

  if (!tokenOk) {
    if (eventId) await run(`UPDATE petpooja_events SET note=? WHERE id=?`, ["rejected: bad/missing token", eventId]);
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    // Resolve outlet; fall back to outlet #1 if the restID isn't mapped yet.
    const matched = await one<{ id: number }>(`SELECT id FROM restaurants WHERE pp_rest_id = ? LIMIT 1`, [restId]);
    const fallback = await one<{ id: number }>(`SELECT id FROM restaurants ORDER BY id LIMIT 1`);
    const restaurantId = matched?.id ?? fallback?.id;
    const outletNote = matched ? null : `outlet ${restId} not mapped - used fallback`;

    const code = `PP-${restId || "X"}-${ppOrderId || Date.now()}`;
    const placedAt = order?.created_on ? String(order.created_on) : new Date().toISOString();
    const customer = cust?.name ? String(cust.name) : null;

    // Idempotent insert: if Petpooja resends the same order, don't duplicate.
    const inserted = await one<{ id: number }>(
      `INSERT INTO orders (code, restaurant_id, table_no, customer, channel, placed_at, status, kot, ext_id, notes, order_type)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
       ON CONFLICT (code) DO NOTHING
       RETURNING id`,
      [code, restaurantId, order?.table_no ? String(order.table_no) : null, customer, channel, placedAt,
       order?.token_no != null && order?.token_no !== "" ? String(order.token_no) : null,
       order?.order_from_id ? String(order.order_from_id) : null,
       order?.comment ? String(order.comment) : null,
       order?.order_type ? String(order.order_type) : null]
    );

    if (!inserted) {
      // Petpooja re-sent this order (e.g. the order was edited). We don't duplicate it, but we
      // RE-SYNC each add-on's camera flag from the CURRENT payload price -- so if a price changed
      // on the edited order, the camera shows/hides accordingly. We only update the no_capture
      // flag; we never delete items, so any photos already captured are preserved.
      const existing = await one<{ id: number }>(`SELECT id FROM orders WHERE code = ? LIMIT 1`, [code]);
      if (existing) {
        for (const it of items) {
          const addons = Array.isArray(it?.addon) ? it.addon : [];
          for (const ad of addons) {
            const adName = String(ad?.name ?? "").trim();
            if (!adName) continue;
            const adNoCapture = !(Number(ad?.price) > 0); // price > 0 -> camera; else no camera
            await run(
              `UPDATE order_items SET no_capture = ?
                 WHERE order_id = ?
                   AND dish_id IN (SELECT id FROM dishes WHERE lower(name) = lower(?) AND category IN ('Add-Ons','Extras'))`,
              [adNoCapture, existing.id, adName]
            );
          }
        }
      }
      if (eventId) await run(`UPDATE petpooja_events SET note=? WHERE id=?`, ["duplicate re-synced (add-on camera flags updated from price)", eventId]);
      return NextResponse.json({ ok: true, duplicate: true, resynced: true, code });
    }
    const orderId = inserted.id;

    // Insert each line item; map to an existing dish or create one on the fly.
    for (const it of items) {
      const ppItem = String(it?.itemid ?? "");
      const name = String(it?.name ?? "Item").trim();
      const qty = Number(it?.quantity) > 0 ? Math.floor(Number(it.quantity)) : 1;
      const category = it?.category_name ? String(it.category_name) : "Uncategorized";

      let dish = await one<{ id: number }>(`SELECT id FROM dishes WHERE pp_item_id = ? LIMIT 1`, [ppItem]);
      if (!dish && name) dish = await one<{ id: number }>(`SELECT id FROM dishes WHERE lower(name) = lower(?) LIMIT 1`, [name]);
      if (!dish) {
        dish = await one<{ id: number }>(
          `INSERT INTO dishes (name, category, pp_item_id) VALUES (?, ?, ?) RETURNING id`,
          [name, category, ppItem || null]
        );
      } else if (ppItem) {
        // backfill the Petpooja id if we matched by name
        await run(`UPDATE dishes SET pp_item_id = ? WHERE id = ? AND (pp_item_id IS NULL OR pp_item_id = '')`, [ppItem, dish.id]);
      }
      if (dish) {
        await run(`INSERT INTO order_items (order_id, dish_id, quantity) VALUES (?, ?, ?)`, [orderId, dish.id, qty]);
      }

      // Add-ons are nested inside each Petpooja item -> store each as an add-on line.
      const addons = Array.isArray(it?.addon) ? it.addon : [];
      for (const ad of addons) {
        const adName = String(ad?.name ?? "").trim();
        if (!adName) continue;
        const adQty = Number(ad?.quantity) > 0 ? Math.floor(Number(ad.quantity)) : 1;
        // Camera logic is driven ONLY by this order's live Petpooja payload (no Excel/lookup).
        // price > 0  -> paid add-on  -> show camera;  price <= 0 or missing -> free add-on -> no camera.
        // Read per order, so any future price change in Petpooja is picked up automatically.
        const adPrice = Number(ad?.price);
        const adNoCapture = !(adPrice > 0);
        let adDish = await one<{ id: number }>(`SELECT id FROM dishes WHERE lower(name) = lower(?) AND category IN ('Add-Ons','Extras') LIMIT 1`, [adName]);
        if (!adDish) adDish = await one<{ id: number }>(`INSERT INTO dishes (name, category) VALUES (?, 'Add-Ons') RETURNING id`, [adName]);
        if (adDish) await run(`INSERT INTO order_items (order_id, dish_id, quantity, no_capture) VALUES (?, ?, ?, ?)`, [orderId, adDish.id, adQty, adNoCapture]);
      }
    }

    if (eventId) await run(`UPDATE petpooja_events SET mapped_order_id=?, note=? WHERE id=?`, [orderId, outletNote, eventId]);
    return NextResponse.json({ ok: true, orderId, code, items: items.length });
  } catch (e: any) {
    if (eventId) await run(`UPDATE petpooja_events SET note=? WHERE id=?`, [`error: ${String(e?.message).slice(0, 200)}`, eventId]).catch(() => {});
    return NextResponse.json({ ok: false, error: "processing failed" }, { status: 500 });
  }
}
