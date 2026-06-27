import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Paths that do NOT require login.
const PUBLIC_PREFIXES = ["/login", "/api/petpooja", "/auth"];

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p));

  // Outlet accounts are restricted to the KDS only; everyone else is "admin".
  const isOutlet = ((user?.user_metadata as any)?.role) === "outlet";
  const home = isOutlet ? "/orders/live" : "/overview";

  // Not logged in + private page -> login
  if (!user && !isPublic) {
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
