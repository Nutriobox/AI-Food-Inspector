import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

/**
 * Resolve the current user regardless of transport: cookie session for the
 * browser / installable PWA, `Authorization: Bearer <access_token>` for the
 * native Android KDS. Mirrors the same fallback middleware.ts uses, so an API
 * route that calls this reaches the exact same conclusion middleware did.
 *
 * Individual routes that need to enforce role/outlet checks MUST use this
 * instead of `createClient().auth.getUser()` directly — the latter only ever
 * sees cookies, which native clients don't send. Using it silently returns
 * `null` for phone traffic and skips whatever server-side filter the route
 * relies on. That's exactly how outlet accounts on the Android app were
 * seeing every restaurant's orders before this helper existed.
 */
export async function getRequestUser(req?: NextRequest) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        // Route handlers can't set cookies mid-response; middleware refreshes.
        setAll() {},
      },
    }
  );

  const cookieCheck = await supabase.auth.getUser();
  if (cookieCheck.data.user) return cookieCheck.data.user;

  if (!req) return null;
  const authz = req.headers.get("authorization") ?? "";
  if (!authz.toLowerCase().startsWith("bearer ")) return null;

  const bearerCheck = await supabase.auth.getUser(authz.slice(7).trim());
  return bearerCheck.data.user ?? null;
}
