"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Item = { id: string; name: string; price: number; inStock: boolean };
type Group = { id: string; name: string; items: Item[] };
type MenuView = {
  synced: boolean;
  syncedAt?: string;
  restId?: string;
  categories: Group[];
  addonGroups: Group[];
  counts: { items: number; addons: number };
};

function Money({ v }: { v: number }) {
  return <span className="num tabular-nums">{v > 0 ? `₹${v.toFixed(0)}` : "—"}</span>;
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
  const q = search.trim().toLowerCase();

  const cats = useMemo(
    () =>
      (data?.categories ?? [])
        .map((c) => ({ ...c, items: c.items.filter((i) => !q || i.name.toLowerCase().includes(q)) }))
        .filter((c) => c.items.length),
    [data, q]
  );
  const groups = useMemo(
    () =>
      (data?.addonGroups ?? [])
        .map((g) => ({ ...g, items: g.items.filter((i) => !q || i.name.toLowerCase().includes(q)) }))
        .filter((g) => g.items.length),
    [data, q]
  );

  const syncedLabel = data?.syncedAt
    ? new Date(data.syncedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : "—";

  const sections = tab === "items" ? cats : groups;

  return (
    <>
      <PageHeader
        title="Petpooja Menu"
        subtitle="The live menu synced from Petpooja — items, add-ons, prices and stock"
      />

      {/* sync summary */}
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

      {/* tabs + search */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="inline-flex rounded-full bg-line/60 p-1 text-sm">
          {(["items", "addons"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn("px-4 py-1.5 rounded-full capitalize transition", tab === t ? "bg-white text-ink shadow-pill font-medium" : "text-muted hover:text-ink")}
            >
              {t === "items" ? "Items" : "Add-ons"}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            type="search"
            placeholder={`Search ${tab === "items" ? "items" : "add-ons"}...`}
            className="w-full text-sm rounded-btn border border-line bg-white pl-9 pr-3 py-2 focus-ring"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-card bg-white shadow-card p-8 text-center text-muted text-sm">Loading menu…</div>
      ) : !data?.synced ? (
        <div className="rounded-card bg-white shadow-card p-8 text-center text-muted text-sm">
          No menu received from Petpooja yet. Trigger a menu push in Petpooja (Nutrio Box – Website) and it will appear here.
        </div>
      ) : sections.length === 0 ? (
        <div className="rounded-card bg-white shadow-card p-8 text-center text-muted text-sm">No matches.</div>
      ) : (
        <div className="space-y-4">
          {sections.map((sec) => (
            <div key={sec.id} className="rounded-card bg-white shadow-card border border-line overflow-hidden">
              <div className="px-4 py-2.5 bg-canvas/60 border-b border-line flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">{sec.name}</span>
                <span className="text-[11px] text-muted num">{sec.items.length}</span>
              </div>
              <ul className="divide-y divide-line">
                {sec.items.map((it) => (
                  <li key={it.id} className="px-4 py-2.5 flex items-center gap-3">
                    <span className="text-[13px] text-ink flex-1 min-w-0 truncate">{it.name}</span>
                    <span className="text-[13px] font-medium w-16 text-right"><Money v={it.price} /></span>
                    <StockBadge on={it.inStock} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
