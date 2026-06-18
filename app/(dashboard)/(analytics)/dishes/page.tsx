"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { RefreshButton } from "@/components/refresh-button";
import { useFilters } from "@/components/filter-context";
import { api, buildFilterQS } from "@/lib/api";
import { cn } from "@/lib/utils";

type DishStat = { id: number; name: string; orders: number; eval: number; rate: number; errors: number };

export default function DishesPage() {
  const [view, setView] = useState<"grid" | "list">("grid");
  const { applied } = useFilters();
  const qs = buildFilterQS(applied);
  const { data, isLoading } = useQuery({
    queryKey: ["dishes-stats", qs],
    queryFn: () => api<{ rows: DishStat[] }>(`/api/dishes?mode=stats&${qs}`),
  });
  const dishes = data?.rows ?? [];

  return (
    <>
      <PageHeader title="Dishes" subtitle="Per-dish quality and evaluation coverage"
        actions={
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-btn border border-line bg-white p-0.5 text-xs">
              <button onClick={() => setView("grid")} className={cn("px-2 py-1 rounded-[4px]", view === "grid" && "bg-canvas font-medium")}>Grid</button>
              <button onClick={() => setView("list")} className={cn("px-2 py-1 rounded-[4px]", view === "list" && "bg-canvas font-medium")}>List</button>
            </div>
            <RefreshButton />
          </div>
        }
      />
      {isLoading ? (
        <div className="rounded-card bg-white shadow-card p-8 text-center text-muted text-sm">Loading…</div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {dishes.map((d) => {
            const tone = d.rate >= 40 ? "success" : d.rate >= 30 ? "warn" : "danger";
            const ring = tone === "success" ? "#10B981" : tone === "warn" ? "#F59E0B" : "#EF4444";
            return (
              <div key={d.id} className="rounded-card bg-white shadow-card p-5">
                <div className="flex items-start justify-between">
                  <div className="font-semibold tracking-tight">{d.name}</div>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold" style={{ background: ring + "1A", color: ring }}>{d.rate}% eval</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4 text-center">
                  <div><div className="num text-xl font-bold">{d.orders}</div><div className="text-[11px] text-muted">orders</div></div>
                  <div><div className="num text-xl font-bold text-brand-600">{d.eval}</div><div className="text-[11px] text-muted">evaluated</div></div>
                  <div><div className="num text-xl font-bold text-danger-500">{d.errors}</div><div className="text-[11px] text-muted">errors</div></div>
                </div>
                <button onClick={() => toast(`Open details: ${d.name}`)} className="mt-4 w-full text-xs font-medium px-3 py-2 rounded-btn border border-line hover:bg-canvas">View details</button>
              </div>
            );
          })}
          {dishes.length === 0 && (
            <div className="col-span-full rounded-card bg-white shadow-card p-8 text-center text-muted text-sm">No dishes match your filters.</div>
          )}
        </div>
      ) : (
        <div className="rounded-card bg-white shadow-card divide-y divide-line">
          {dishes.map((d) => (
            <div key={d.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{d.name}</div>
                <div className="text-xs text-muted mt-0.5">{d.orders} orders · {d.eval} evaluations</div>
              </div>
              <div className="num text-xs flex items-center gap-4">
                <span className="text-brand-600">{d.eval} eval</span>
                <span className="text-danger-500">{d.errors} errors</span>
                <span className="text-muted">{d.rate}%</span>
              </div>
            </div>
          ))}
          {dishes.length === 0 && (
            <div className="p-8 text-center text-muted text-sm">No dishes match your filters.</div>
          )}
        </div>
      )}
    </>
  );
}
