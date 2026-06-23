import { NextResponse } from "next/server";
import { q } from "@/db/client";

export const dynamic = "force-dynamic";

// Diagnostics: returns the real DB connection result (or error) as JSON.
export async function GET() {
  const hasUrl = !!process.env.DATABASE_URL;
  try {
    const rows = await q<{ n: number }>("SELECT count(*)::int AS n FROM restaurants");
    return NextResponse.json({ ok: true, hasDatabaseUrl: hasUrl, restaurants: rows[0]?.n ?? 0 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, hasDatabaseUrl: hasUrl, error: e?.message ?? String(e), code: e?.code ?? null },
      { status: 200 }
    );
  }
}
