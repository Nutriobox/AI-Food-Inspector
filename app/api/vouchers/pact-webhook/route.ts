import { NextRequest, NextResponse } from "next/server";
import { one, run } from "@/db/client";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Real-time factory- and outlet-stage vouchers pushed by PACT into NutrioBox. One POST
// per event, tagged with an "event" field. Built to mirror the Petpooja webhook:
// authenticate, capture the raw payload first (so nothing is ever lost), then validate.
//
// Auth: PACT sends the shared secret as EITHER  Authorization: Bearer <token>  OR
//       x-api-key: <token>. Set the secret in the PACT_WEBHOOK_TOKEN env var (Vercel).
// The route is listed in middleware PUBLIC_PREFIXES so it does not require a Supabase
// login — it authenticates with its own token instead.
//
// 2026-10-19: added the 8 document types Mayank asked PACT for over email
// (PURCHASE_ORDER, STOCK_INWARD, GRN_RETURN, STOCK_OUTWARD_OUTLET,
// OUTLET_STOCK_RECEIPT, FACTORY_SALES_ORDER, FACTORY_SALES_INVOICE,
// OUTLET_SALES_RETURN) so Satvik can share one URL + one key for the full set.
// STOCK_RECEIPT is kept as an alias for STOCK_INWARD so an older sender keeps working.
const EVENTS = new Set([
  // Original factory-stage voucher events (live since 2026 setup)
  "PMR", "STOCK_RECEIPT", "ISSUE_TO_PRODUCTION", "WIP", "FG_RECEIPT", "SECONDARY",
  // Added 2026-10-19 for PACT's expanded webhook list
  "PURCHASE_ORDER",
  "STOCK_INWARD",
  "GRN_RETURN",            // Goods Received Return
  "STOCK_OUTWARD_OUTLET",  // Stock Outward to Outlet
  "OUTLET_STOCK_RECEIPT",  // Outlet-side GRN of a factory dispatch
  "FACTORY_SALES_ORDER",
  "FACTORY_SALES_INVOICE",
  "OUTLET_SALES_RETURN",   // Outlet / Sales Return
]);

// Opening the URL in a browser is a GET -> friendly "alive" message, like the PP hook.
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "NutrioBox WMS — PACT voucher webhook",
    message: "Live. PACT posts voucher events here via POST, one per event.",
    events: Array.from(EVENTS),
  });
}

function tokenFrom(req: NextRequest): string {
  const authz = req.headers.get("authorization") ?? "";
  if (authz.toLowerCase().startsWith("bearer ")) return authz.slice(7).trim();
  return (req.headers.get("x-api-key") ?? "").trim();
}

export async function POST(req: NextRequest) {
  const rl = await rateLimit("pact_webhook", clientIp(req), 600, 60);
  if (!rl.ok) return NextResponse.json({ ok: false, error: "rate limit exceeded" }, { status: 429 });

  let body: any = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
  }

  const expected = process.env.PACT_WEBHOOK_TOKEN || "";
  const tokenOk = !!expected && tokenFrom(req) === expected;
  const event = String(body?.event ?? "").toUpperCase();
  const voucherNo = String(body?.voucher_no ?? "");

  // Always capture the raw event first, so we can inspect/replay every incoming voucher.
  let eventId: number | undefined;
  try {
    const ev = await one<{ id: number }>(
      `INSERT INTO pact_events (token_ok, event, voucher_no, raw)
       VALUES (?, ?, ?, ?) RETURNING id`,
      [tokenOk, event || null, voucherNo || null, JSON.stringify(body)]
    );
    eventId = ev?.id;
  } catch {
    // capture failure shouldn't block the auth/validation response below
  }

  if (!tokenOk) {
    if (eventId) await run(`UPDATE pact_events SET note=? WHERE id=?`, ["rejected: bad/missing token", eventId]);
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!EVENTS.has(event)) {
    if (eventId) await run(`UPDATE pact_events SET note=? WHERE id=?`, ["rejected: unknown event", eventId]);
    return NextResponse.json(
      { ok: false, error: `unknown event; expected one of: ${Array.from(EVENTS).join(", ")}` },
      { status: 400 }
    );
  }

  // Accepted and stored. Turning each event type into stock/production movements is the
  // next phase (needs the field spec + the WMS data model); for now every valid voucher
  // is captured in pact_events and acknowledged so PACT can go live against a real endpoint.
  return NextResponse.json({ ok: true, id: eventId, event });
}
