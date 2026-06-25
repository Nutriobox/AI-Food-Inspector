import { NextRequest, NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function admin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Only signed-in users may view/manage the team.
async function requireUser() {
  const supabase = createServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await admin().auth.admin.listUsers();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const users = (data?.users ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
  }));
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const email = String(body?.email || "").trim();
  const password = String(body?.password || "");
  if (!email || password.length < 6) {
    return NextResponse.json({ error: "Email and a password of at least 6 characters are required." }, { status: 400 });
  }
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password,
    email_confirm: true, // no email verification step; account works immediately
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.user?.id, email: data.user?.email });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { error } = await admin().auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
