import { NextResponse } from "next/server";
import { getManagerStats } from "@/db/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ rows: await getManagerStats() });
}
