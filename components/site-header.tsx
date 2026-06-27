"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BarChart3, ChevronDown, Monitor, Settings, Sparkles, User, Users, HelpCircle, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { syncKioskFromUrl } from "@/lib/kiosk";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { label: "Analytics", href: "/overview", icon: BarChart3, section: "analytics" },
  { label: "Configuration", href: "/dish-config", icon: Settings, section: "config" },
  { label: "KDS", href: "/orders/live", icon: Monitor, section: "kds" },
  { label: "AI Test", href: "/ai-test", icon: Sparkles, section: "aitest" },
] as const;

function sectionFor(path: string) {
  if (path === "/dish-config") return "config";
  if (path.startsWith("/orders/live")) return "kds";
  if (path.startsWith("/ai-test")) return "aitest";
  return "analytics";
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const active = sectionFor(pathname);
  const [open, setOpen] = useState(false);
  const [kiosk, setKiosk] = useState(false);
  const [email, setEmail] = useState<string>("");
  const [outlet, setOutlet] = useState<string>("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setKiosk(syncKioskFromUrl());
  }, [pathname]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
      setOutlet(((data.user?.user_metadata as any)?.outlet as string) ?? "");
    });
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initial = (email || "U").trim().charAt(0).toUpperCase();

  if (kiosk) {
    return (
      <header className="sticky top-0 z-30 bg-canvas/85 backdrop-blur border-b border-line">
        <div className="max-w-[1440px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-onwhite.png" alt="Nutriobox" className="h-6 w-auto" />
            <span className="text-muted">&middot;</span>
            <span className="text-sm font-semibold text-ink">{outlet || "Kitchen Display"}</span>
          </div>
          <span className="text-xs text-muted">KDS mode</span>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-30 bg-canvas/85 backdrop-blur border-b border-line">
      <div className="max-w-[1440px] mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/overview" className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-onwhite.png" alt="Nutriobox" className="h-6 w-auto" />
          <span className="hidden md:inline text-muted">&middot;</span>
          <span className="hidden md:inline text-sm text-muted">Food Quality Platform</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 bg-line/60 p-1 rounded-full">
          {NAV.map((n) => {
            const Icon = n.icon;
            const isActive = active === n.section;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm flex items-center gap-1.5 focus-ring text-muted hover:text-ink",
                  isActive && "bg-white text-ink shadow-pill"
                )}
              >
                <Icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="relative" ref={ref}>
          <button
            onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
            className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-md hover:bg-line/60 focus-ring"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white text-xs font-semibold">{initial}</span>
            <span className="hidden sm:inline">{email || "Account"}</span>
            <ChevronDown className="h-4 w-4 text-muted" />
          </button>
          {open && (
            <div className="absolute right-0 mt-2 w-56 rounded-card bg-white shadow-card p-1 text-sm z-50">
              <Link onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-canvas" href="/account"><User className="h-4 w-4 text-muted" />Account settings</Link>
              <Link onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-canvas" href="/team"><Users className="h-4 w-4 text-muted" />Team</Link>
              <Link onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-canvas" href="/help"><HelpCircle className="h-4 w-4 text-muted" />Help &amp; docs</Link>
              <div className="my-1 h-px bg-line" />
              <button onClick={signOut} className="flex w-full items-center gap-2 px-3 py-2 rounded-md hover:bg-canvas text-danger-600"><LogOut className="h-4 w-4" />Sign out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
