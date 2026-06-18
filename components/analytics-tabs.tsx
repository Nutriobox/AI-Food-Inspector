"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Overview", href: "/overview" },
  { label: "Recent Orders", href: "/orders" },
  { label: "Evaluations", href: "/evaluations" },
  { label: "Order Issues", href: "/order-issues" },
  { label: "Dishes", href: "/dishes" },
  { label: "Managers", href: "/managers" },
  { label: "Restaurants", href: "/restaurants" },
  { label: "Analytics", href: "/analytics" },
] as const;

export function AnalyticsTabs() {
  const pathname = usePathname();
  return (
    <nav role="tablist" className="flex items-center gap-6 border-b border-line mb-5 overflow-x-auto">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-selected={active}
            className={cn(
              "py-3 text-sm whitespace-nowrap focus-ring",
              active ? "text-ink font-semibold shadow-[inset_0_-2px_0_0_#1A1A1A]" : "text-muted hover:text-ink"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
