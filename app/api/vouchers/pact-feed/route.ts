import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { q } from "@/db/client";

export const dynamic = "force-dynamic";

// Read-only feed of PACT vouchers received by /api/vouchers/pact-webhook, for the
// Allsure PACT -> Tally connector (runs next to TallyPrime on the AWS server).
//
// Why product + quantity only: the webhook's money fields are not usable for
// accounting (checked 25-Nov-2026: 119 of 135 Factory Sales Invoices carry no
// amount, Stock Outward rates are garbage, e.g. Mint Chutney at Rs 92.7 crore/line).
// The connector values each line at the Tally stock item's own rate and GST, after
// the PACT product is mapped to a Tally item (with unit conversion) in its Product
// Master. Do not add PACT's rate/amount here without re-checking that data.
//
// GET /api/vouchers/pact-feed?event=STOCK_INWARD&from=2026-11-01&to=2026-11-25
//   Auth: Authorization: Bearer <PACT_FEED_TOKEN>  (or x-api-key). Separate from the
//   webhook's PACT_WEBHOOK_TOKEN so the PACT sender's key never sits on the Tally box.
//   Listed under /api/vouchers in middleware PUBLIC_PREFIXES, so no Supabase login.
//
// Rows use the field names the connector's engine.js already reads (DocNO, DocDate,
// BillNo, PartyName, GSTIN, Products[] with ProductName/ProductCode/Qty/UOM).

const EVENTS = new Set(["STOCK_INWARD", "STOCK_OUTWARD_OUTLET", "FACTORY_SALES_INVOICE"]);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function tokenFrom(req: NextRequest): string {
  const auth = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return (m ? m[1] : req.headers.get("x-api-key") || "").trim();
}
function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

type Line = { ProductName: string; ProductCode: string; Qty: number; UOM: string };

export async function GET(req: NextRequest) {
  const expected = process.env.PACT_FEED_TOKEN || "";
  if (!expected) return NextResponse.json({ ok: false, error: "PACT_FEED_TOKEN is not set" }, { status: 503 });
  if (!sameSecret(tokenFrom(req), expected)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const u = req.nextUrl.searchParams;
  const event = String(u.get("event") || "").toUpperCase();
  const from = String(u.get("from") || ""), to = String(u.get("to") || "");
  if (!EVENTS.has(event)) return NextResponse.json({ ok: false, error: "event must be one of " + [...EVENTS].join(", ") }, { status: 400 });
  if (!ISO.test(from) || !ISO.test(to) || from > to) return NextResponse.json({ ok: false, error: "from and to must be YYYY-MM-DD, from <= to" }, { status: 400 });
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 92) return NextResponse.json({ ok: false, error: "date range is limited to 92 days" }, { status: 400 });

  try {
    // PACT re-sends a voucher when it is edited: keep only the latest accepted copy.
    const vouchers = await q<{ voucher_no: string; received_at: string; raw: any }>(
      `SELECT DISTINCT ON (voucher_no) voucher_no, received_at, raw
         FROM pact_events
        WHERE event = ? AND note IS NULL AND voucher_no IS NOT NULL
          AND raw->>'voucher_date' BETWEEN ? AND ?
        ORDER BY voucher_no, id DESC`,
      [event, from, to]
    );

    const rows = vouchers.map((v) => {
      const r = v.raw || {};
      const party = r.party || {};
      // PACT sends one line per scanned carton/batch; Tally needs one line per product.
      const byProduct = new Map<string, Line>();
      for (const it of Array.isArray(r.items) ? r.items : []) {
        const name = String(it?.name ?? "").trim(), code = String(it?.code ?? "").trim();
        const uom = String(it?.unit_name ?? "").trim(), qty = Number(it?.qty) || 0;
        if (!name && !code) continue;
        const k = (code || name) + "|" + uom;
        const ln = byProduct.get(k) || { ProductName: name, ProductCode: code, Qty: 0, UOM: uom };
        ln.Qty = Math.round((ln.Qty + qty) * 1000) / 1000;
        byProduct.set(k, ln);
      }
      return {
        DocNO: v.voucher_no,
        DocDate: r.voucher_date || "",
        BillNo: r.invoice_no || "",
        BillDate: r.invoice_date || "",
        PartyName: String(party.name ?? "").trim(),
        GSTIN: party.gstin || "",
        Narration: [r.warehouse, r.ref_voucher_type && r.ref_voucher_no ? r.ref_voucher_type + " " + r.ref_voucher_no : ""].filter(Boolean).join(" / "),
        ReceivedAt: v.received_at,
        Products: [...byProduct.values()],
      };
    });
    return NextResponse.json({ ok: true, event, from, to, count: rows.length, rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "query failed" }, { status: 500 });
  }
}
