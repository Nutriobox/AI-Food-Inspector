import { NextResponse } from "next/server";
import { q } from "@/db/client";

export const dynamic = "force-dynamic";

// Recent PACT voucher webhook events, newest first. Read-only; protected by the same
// Supabase login as the rest of the dashboard (middleware). Powers the PACT Events page.
export async function GET() {
  try {
    const events = await q(
      `SELECT id, received_at, token_ok, event, voucher_no, note, raw
       FROM pact_events ORDER BY id DESC LIMIT 200`
    );
    return NextResponse.json({ events });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "query failed", events: [] }, { status: 500 });
  }
}
