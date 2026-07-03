"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Item = { id: string; name: string; priceFrom: number; priceTo: number; inStock: boolean };
type Group = { id: string; name: string; items: Item[] };
type MenuView = {
  synced: boolean;
  syncedAt?: string;
  restId?: string;
  categories: Group[];
  addonGroups: Group[];
  counts: { items: number; addons: number };
};

function Price({ from, to }: { from: number; to: number }) {
  if (!from) return <span className="text-muted">—</span>;
  return <span className="num tabular-nums">₹{from}{to > from ? `–${to}` : ""}</span>;
}

function StockBadge({ on }: { on: boolean }) {
  return (
    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0", on ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
      {on ? "In stock" : "Out of stock"}
    </span>
  );
}

export default function PetpoojaMenuPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["menu-view"],
    queryFn: () => api<MenuView>("/api/menu-view"),
    refetchInterval: 60000,
  });
  const [tab, setTab] = useState<"items" | "addons">("items");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const q = search.trim().toLowerCase();

  const cats = useMemo(
    () => (data?.categories ?? []).map((c) => ({ ...c, items: c.items.filter((i) => !q || i.name.toLowerCase().includes(q)) })).filter((c) => c.items.length),
    [data, q]
  );
  const groups = useMemo(
    () => (data?.addonGroups ?? []).map((g) => ({ ...g, items: g.items.filter((i) => !q || i.name.toLowerCase().includes(q)) })).filter((g) => g.items.length),
    [data, q]
  );
  const sections = tab === "items" ? cats : groups;

  const syncedLabel = data?.syncedAt ? new Date(data.syncedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

  function jumpTo(id: string) {
    setActive(id);
    const c = scrollRef.current;
    const el = document.getElementById("sec-" + id);
    if (c && el) {
      const top = el.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop;
      c.scrollTo({ top: Math.max(0, top - 4), behavior: "smooth" });
    }
  }

  return (
    <>
      <PageHeader title="Petpooja Menu" subtitle="The live menu synced from Petpooja — items, add-ons, prices and stock" />

      <div className="rounded-card bg-white shadow-card border border-line px-4 py-3 mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <div>
          <span className="text-muted text-xs">Last synced from Petpooja</span>{" "}
          <span className="font-medium">{syncedLabel}</span>
          {data?.restId && <span className="text-muted text-xs"> · outlet {data.restId}</span>}
        </div>
        <div className="ml-auto flex items-center gap-4 text-xs text-muted">
          <span><span className="font-semibold text-ink num">{data?.counts.items ?? 0}</span> items</span>
          <span><span className="font-semibold text-ink num">{data?.counts.addons ?? 0}</span> add-ons</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="inline-flex rounded-full bg-line/60 p-1 text-sm">
          {(["items", "addons"] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); setActive(""); }} className={cn("px-4 py-1.5 rounded-full transition", tab === t ? "bg-white text-ink shadow-pill font-medium" : "text-muted hover:text-ink")}>
              {t === "items" ? "Items" : "Add-ons"}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} type="search" placeholder={`Search ${tab === "items" ? "items" : "add-ons"}...`} className="w-full text-sm rounded-btn border border-line bg-white pl-9 pr-3 py-2 focus-ring" />
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-card bg-white shadow-card p-8 text-center text-muted text-sm">Loading menu…</div>
      ) : !data?.synced ? (
        <div className="rounded-card bg-white shadow-card p-8 text-center text-muted text-sm">
          No menu received from Petpooja yet. Trigger a menu push in Petpooja (Nutrio Box – Website) and it will appear here.
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-4 md:h-[calc(100vh-17rem)] md:min-h-[420px]">
          {/* Left rail: click a category/group to jump to it */}
          <aside className="w-full md:w-60 shrink-0 rounded-card bg-white shadow-card border border-line flex flex-col overflow-hidden max-h-[35vh] md:max-h-none">
            <div className="px-3 py-2.5 border-b border-line text-[11px] font-semibold text-muted uppercase tracking-wide">
              {tab === "items" ? "Categories" : "Add-on groups"}
            </div>
            <div className="flex-1 overflow-y-auto p-1.5">
              {sections.map((sec) => (
                <button
                  key={sec.id}
                  onClick={() => jumpTo(sec.id)}
                  className={cn("w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-[13px] transition", active === sec.id ? "bg-brand-50 text-brand-700 font-semibold" : "text-ink hover:bg-canvas")}
                >
                  <span className="truncate flex-1">{sec.name}</span>
                  <span className={cn("text-[11px] shrink-0 tabular-nums", active === sec.id ? "text-brand-700" : "text-muted")}>{sec.items.length}</span>
                </button>
              ))}
              {sections.length === 0 && <div className="px-3 py-4 text-xs text-muted">No matches.</div>}
            </div>
          </aside>

          {/* Right: scrollable sections */}
          <section ref={scrollRef} className="flex-1 min-w-0 overflow-y-auto space-y-4 pr-0.5">
            {sections.length === 0 ? (
              <div className="rounded-card bg-white shadow-card p-8 text-center text-muted text-sm">No matches.</div>
            ) : (
              sections.map((sec) => (
                <div key={sec.id} id={"sec-" + sec.id} className="rounded-card bg-white shadow-card border border-line overflow-hidden scroll-mt-2">
                  <div className="px-4 py-2.5 bg-canvas/60 border-b border-line flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">{sec.name}</span>
                    <span className="text-[11px] text-muted num">{sec.items.length}</span>
                  </div>
                  <ul className="divide-y divide-line">
                    {sec.items.map((it) => (
                      <li key={it.id} className="px-4 py-2.5 flex items-center gap-3">
                        <span className="text-[13px] text-ink flex-1 min-w-0 truncate">{it.name}</span>
                        <span className="text-[13px] font-medium w-24 text-right"><Price from={it.priceFrom} to={it.priceTo} /></span>
                        <StockBadge on={it.inStock} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
        </div>
      )}
    </>
  );
}
