"use client";

import Link from "next/link";
import { ImageIcon, Plus, Search } from "lucide-react";
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
  orders: number;
  eval: number;
};

const ORDER: DishStatus[] = ["configured", "partial", "not_configured"];

function isImageUrl(v: string | null): v is string {
  return !!v && /^https?:\/\//.test(v);
}

export default function DishConfigPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dishes-list"],
    queryFn: () => api<{ rows: Dish[] }>("/api/dishes"),
  });
  const dishes = data?.rows ?? [];

  const [search, setSearch] = useState("");
  const [active, setActive] = useState<DishStatus | null>(null);

  const counts = useMemo(() => {
    const c: Record<DishStatus, number> = { configured: 0, partial: 0, not_configured: 0 };
    for (const d of dishes) c[dishStatus(d)]++;
    return c;
  }, [dishes]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dishes.filter((d) => {
      if (active && dishStatus(d) !== active) return false;
      if (q && !(`${d.name} ${d.category}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [dishes, search, active]);

  return (
    <>
      <PageHeader
        title="Configuration"
        subtitle="Dishes, evaluation criteria, and tag setup"
        actions={
          <button
            onClick={() => toast.info("New-dish form coming soon")}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-btn bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 focus-ring"
          >
            <Plus className="h-4 w-4" /> New Dish
          </button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            type="search"
            placeholder="Search any item..."
            className="w-full text-sm rounded-btn border border-line bg-white pl-9 pr-3 py-2 focus-ring"
          />
        </div>
        <div className="flex items-center gap-2">
          {ORDER.map((s) => {
            const m = STATUS_META[s];
            const on = active === s;
            return (
              <button
                key={s}
                onClick={() => setActive(on ? null : s)}
                className={cn(
                  "inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border transition",
                  on ? "border-transparent" : "border-line bg-white hover:bg-canvas"
                )}
                style={on ? { background: m.bg, color: m.fg } : undefined}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: m.dot }} />
                {m.label} {counts[s]}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-card bg-white shadow-card p-8 text-center text-muted text-sm">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {visible.map((d) => {
              const s = dishStatus(d);
              const m = STATUS_META[s];
              return (
                <Link
                  key={d.id}
                  href={`/dish-config/${d.id}`}
                  className="relative block rounded-card bg-white shadow-card border-t-[3px] hover:shadow-md transition p-3"
                  style={{ borderTopColor: m.bar }}
                >
                  <span
                    className="absolute top-2 right-2 text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{ background: m.bg, color: m.fg }}
                  >
                    {m.label}
                  </span>
                  <div className="h-10 w-10 rounded-md bg-canvas overflow-hidden flex items-center justify-center text-muted mb-2">
                    {isImageUrl(d.reference_image) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={d.reference_image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-5 w-5" />
                    )}
                  </div>
                  <div className="text-[13px] font-medium leading-tight pr-2 min-h-[34px]">{d.name}</div>
                  <div className="text-[11px] text-muted mt-1.5">
                    {d.category} · {d.expected_grams} g
                  </div>
                </Link>
              );
            })}
          </div>
          {visible.length === 0 && (
            <div className="rounded-card bg-white shadow-card p-8 text-center text-muted text-sm mt-3">
              No items match your search or filter.
            </div>
          )}
        </>
      )}
    </>
  );
}
