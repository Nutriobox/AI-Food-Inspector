import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Paths that do NOT require login.
const PUBLIC_PREFIXES = ["/login", "/api/petpooja", "/api/vouchers", "/auth", "/sw.js", "/manifest.webmanifest"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Cookie session (browser / PWA).
  let {
    data: { user },
  } = await supabase.auth.getUser();

  // Native clients (the Android KDS) cannot use cookies, so they send the Supabase
  // access token as a Bearer header instead. The token is verified by Supabase the
  // same way a cookie session is - this is an additional transport, not a bypass.
  if (!user) {
    const authz = request.headers.get("authorization") ?? "";
    if (authz.toLowerCase().startsWith("bearer ")) {
      const { data } = await supabase.auth.getUser(authz.slice(7).trim());
      user = data.user;
    }
  }

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p));

  // Outlet accounts are restricted to the KDS only; everyone else is "admin".
  const isOutlet = ((user?.user_metadata as any)?.role) === "outlet";
  const home = isOutlet ? "/orders/live" : "/overview";

  const isApi = path.startsWith("/api/");

  // Not logged in + private page -> login.
  // API routes must answer with JSON: a 302 to an HTML login page makes every
  // client (native and web alike) try to parse HTML as JSON on an expired session.
  if (!user && !isPublic) {
    if (isApi) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Logged in + on the login page -> their home
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = home;
    return NextResponse.redirect(url);
  }

  // Outlet accounts may ONLY use the KDS (and the APIs it needs). Anything else -> KDS.
  if (user && isOutlet) {
    const allowed =
      path === "/orders/live" ||
      path.startsWith("/orders/live/") ||
      path === "/dish-config" ||
      path.startsWith("/dish-config/") || // item configuration is done on the machine (camera + scale)
      path.startsWith("/api/") ||
      path === "/login";
    if (!allowed) {
      const url = request.nextUrl.clone();
      url.pathname = "/orders/live";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|ai)$).*)"],
};
