"use client";

import { Store } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { RefreshButton } from "@/components/refresh-button";
import { useFilters } from "@/components/filter-context";
import { api, buildFilterQS } from "@/lib/api";
import { cn } from "@/lib/utils";

type RestoRow = { id: number; name: string; orders: number; eval: number; rate: number; errors: number };

export default function RestaurantsPage() {
  const { applied } = useFilters();
  const qs = buildFilterQS(applied);
  const { data, isLoading } = useQuery({
    queryKey: ["restaurants-stats", qs],
    queryFn: () => api<{ rows: RestoRow[] }>(`/api/restaurants?${qs}`),
  });
  const rows = data?.rows ?? [];

  return (
    <>
      <PageHeader title="Restaurants" subtitle="Per-location rollup of all KPIs" actions={<RefreshButton />} />
      {isLoading ? (
        <div className="rounded-card bg-white shadow-card p-8 text-center text-muted text-sm">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {rows.map((r) => (
            <div key={r.id} className="rounded-card bg-white shadow-card p-5">
              <div className="flex items-center justify-between">
                <div className="font-semibold tracking-tight flex items-center gap-2"><Store className="h-4 w-4 text-muted" /> {r.name}</div>
                <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-semibold", r.rate >= 15 ? "bg-brand-50 text-brand-700" : "bg-rose-50 text-rose-700")}>{r.rate}% eval</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="rounded-md bg-canvas p-3"><div className="text-[11px] text-muted">Orders</div><div className="num text-xl font-bold">{r.orders.toLocaleString()}</div></div>
                <div className="rounded-md bg-canvas p-3"><div className="text-[11px] text-muted">Evaluated</div><div className="num text-xl font-bold text-brand-600">{r.eval.toLocaleString()}</div></div>
                <div className="rounded-md bg-canvas p-3"><div className="text-[11px] text-muted">Eval rate</div><div className="num text-xl font-bold">{r.rate}%</div></div>
                <div className="rounded-md bg-canvas p-3"><div className="text-[11px] text-muted">Errors</div><div className="num text-xl font-bold text-danger-500">{r.errors.toLocaleString()}</div></div>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="col-span-full rounded-card bg-white shadow-card p-8 text-center text-muted text-sm">No restaurants match your filters.</div>
          )}
        </div>
      )}
    </>
  );
}