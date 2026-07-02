"use client";

import Link from "next/link";
import { ImageIcon, Plus, Search, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { dishStatus, STATUS_META, type DishStatus } from "@/lib/dish-status";

type Dish = {
  id: number;
  name: string;
  category: string;
  expected_grams: number;
  reference_image: string | null;
  description: string | null;
  pp_item_id: string | null;
  swiggy_item_id: string | null;
  zomato_item_id: string | null;
  monitored_tags: string;
  pp_active: boolean;
  orders: number;
  eval: number;
};

const ORDER: DishStatus[] = ["configured", "partial", "not_configured"];
const ALL = "All items";

function isImageUrl(v: string | null): v is string {
  return !!v && /^https?:\/\//.test(v);
}

// Glowing green dot when live (active in Petpooja); grey dot when not live.
function LiveDot({ on }: { on: boolean }) {
  if (!on) return <span className="inline-block h-2 w-2 rounded-full bg-slate-300 shrink-0" />;
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" style={{ boxShadow: "0 0 6px 1px rgba(34,197,94,0.85)" }} />
    </span>
  );
}

export default function MenuLibraryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dishes-list"],
    queryFn: () => api<{ rows: Dish[] }>("/api/dishes"),
    refetchInterval: 30000, // keep the Live status fresh from Petpooja
    refetchIntervalInBackground: true,
  });
  const dishes = data?.rows ?? [];

  const [search, setSearch] = useState("");
  const [active, setActive] = useState<DishStatus | null>(null);
  const [category, setCategory] = useState<string>(ALL);

  // Category list (alphabetical) with item counts and a "live" flag (>=1 active item).
  const categories = useMemo(() => {
    const m = new Map<string, { n: number; live: number }>();
    for (const d of dishes) {
      const e = m.get(d.category) ?? { n: 0, live: 0 };
      e.n++;
      if (d.pp_active) e.live++;
      m.set(d.category, e);
    }
    return [...m.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, v]) => ({ name, n: v.n, live: v.live > 0 }));
  }, [dishes]);

  const liveTotal = useMemo(() => dishes.filter((d) => d.pp_active).length, [dishes]);

  const counts = useMemo(() => {
    const c: Record<DishStatus, number> = { configured: 0, partial: 0, not_configured: 0 };
    for (const d of dishes) c[dishStatus(d)]++;
    return c;
  }, [dishes]);

  const searching = search.trim().length > 0;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dishes
      .filter((d) => {
        if (active && dishStatus(d) !== active) return false;
        if (!searching && category !== ALL && d.category !== category) return false;
        if (q && !(`${d.name} ${d.category}`.toLowerCase().includes(q))) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dishes, search, active, category, searching]);

  return (
    <>
      <PageHeader
        title="Menu Library"
        subtitle="Browse by category, then open an item to configure it for KDS & AI Food Inspector"
        actions={
          <button
            onClick={() => toast.info("New-dish form coming soon")}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-btn bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 focus-ring"
          >
            <Plus className="h-4 w-4" /> New Dish
          </button>
        }
      />

      <div className="flex flex-col md:flex-row gap-4 md:h-[calc(100vh-13rem)] md:min-h-[460px]">
        {/* Left: category list */}
        <aside className="w-full md:w-64 shrink-0 rounded-card bg-white shadow-card border border-line flex flex-col overflow-hidden max-h-[40vh] md:max-h-none">
          <div className="px-3 py-2.5 border-b border-line flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">Categories</span>
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600">
              <LiveDot on={true} /> live
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5">
            <CatButton
              name={ALL}
              n={dishes.length}
              live={liveTotal > 0}
              active={category === ALL && !searching}
              onClick={() => { setCategory(ALL); setSearch(""); }}
            />
            {categories.map((c) => (
              <CatButton
                key={c.name}
                name={c.name}
                n={c.n}
                live={c.live}
                active={!searching && category === c.name}
                onClick={() => { setCategory(c.name); setSearch(""); }}
              />
            ))}
          </div>
        </aside>

        {/* Right: items in the selected category */}
        <section className="flex-1 min-w-0 rounded-card bg-white shadow-card border border-line flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex flex-wrap items-center gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink truncate">{searching ? "Search results" : category}</div>
              <div className="text-[11px] text-muted">
                {visible.length} item{visible.length === 1 ? "" : "s"}
              </div>
            </div>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                type="search"
                placeholder="Search all items..."
                className="w-full text-sm rounded-btn border border-line bg-white pl-9 pr-3 py-2 focus-ring"
              />
            </div>
            <div className="flex items-center gap-1.5">
              {ORDER.map((s) => {
                const m = STATUS_META[s];
                const on = active === s;
                return (
                  <button
                    key={s}
                    onClick={() => setActive(on ? null : s)}
                    title={`${m.label}: ${counts[s]}`}
                    className={cn(
                      "inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-full border transition",
                      on ? "border-transparent" : "border-line bg-white hover:bg-canvas"
                    )}
                    style={on ? { background: m.bg, color: m.fg } : undefined}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: m.dot }} />
                    {counts[s]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center text-muted text-sm">Loading...</div>
            ) : visible.length === 0 ? (
              <div className="p-8 text-center text-muted text-sm">No items match your search or filter.</div>
            ) : (
              <ul className="divide-y divide-line">
                {visible.map((d) => {
                  const s = dishStatus(d);
                  const m = STATUS_META[s];
                  return (
                    <li key={d.id}>
                      <Link
                        href={`/dish-config/${d.id}`}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-canvas transition group"
                      >
                        <div className="h-10 w-10 rounded-md bg-canvas overflow-hidden flex items-center justify-center text-muted shrink-0">
                          {isImageUrl(d.reference_image) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={d.reference_image} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon className="h-5 w-5" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-ink truncate">{d.name}</div>
                          <div className="text-[11px] text-muted truncate">
                            {d.category} · {d.expected_grams} g
                          </div>
                        </div>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-[10px] font-semibold shrink-0 w-14 justify-end",
                            d.pp_active ? "text-green-600" : "text-muted"
                          )}
                          title={d.pp_active ? "Live on Petpooja" : "Not live on Petpooja"}
                        >
                          <LiveDot on={d.pp_active} /> {d.pp_active ? "Live" : "Not live"}
                        </span>
                        <span
                          className="text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0"
                          style={{ background: m.bg, color: m.fg }}
                        >
                          {m.label}
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted shrink-0 group-hover:text-ink" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function CatButton({
  name, n, live, active, onClick,
}: { name: string; n: number; live: boolean; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-center gap-2 px-3 py-2 rounded-md text-[13px] transition",
        active ? "bg-brand-50 text-brand-700 font-semibold" : "text-ink hover:bg-canvas"
      )}
    >
      <span className="truncate flex-1">{name}</span>
      <LiveDot on={live} />
      <span className={cn("text-[11px] shrink-0 tabular-nums w-6 text-right", active ? "text-brand-700" : "text-muted")}>{n}</span>
    </button>
  );
}
