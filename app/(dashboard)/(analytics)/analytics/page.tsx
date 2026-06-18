"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { RefreshButton } from "@/components/refresh-button";
import { ChartCard } from "@/components/chart-card";
import { useFilters } from "@/components/filter-context";
import { api, buildFilterQS } from "@/lib/api";

type Series = { day: string; y: number }[];

export default function AnalyticsPage() {
  const { applied } = useFilters();
  const qs = buildFilterQS(applied);
  const { data: overview } = useQuery({
    queryKey: ["overview-deep", qs],
    queryFn: () => api<{ evals: { data: Series; total: number; avg: number; peak: number }; orders: { data: Series; total: number; avg: number; peak: number }; errors: { data: Series; total: number; avg: number; peak: number } }>(`/api/overview?${qs}`),
  });
  const { data: issues } = useQuery({
    queryKey: ["issues-chart", qs],
    queryFn: () => api<{ rows: { code: string; count: number }[] }>(`/api/issues?${qs}`),
  });
  const { data: dishStats } = useQuery({
    queryKey: ["dishes-chart", qs],
    queryFn: () => api<{ rows: { name: string; orders: number; errors: number }[] }>(`/api/dishes?mode=stats&${qs}`),
  });

  return (
    <>
      <PageHeader title="Analytics" subtitle="Deeper trends and comparative breakdowns" actions={<RefreshButton />} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Evaluations over time" subtitle="Daily evaluations performed"
          total={overview?.evals.total ?? 0} avg={overview?.evals.avg ?? 0} peak={overview?.evals.peak ?? 0}
          color="#10B981" type="area"
          data={(overview?.evals.data ?? []).map((r) => ({ x: r.day.slice(5), y: r.y }))} />
        <ChartCard title="Errors by tag" subtitle="Aggregate counts across NC, WG, ID, WP, NI, IM, CI"
          total={(issues?.rows ?? []).reduce((a, b) => a + b.count, 0)}
          avg={Math.round((issues?.rows ?? []).reduce((a, b) => a + b.count, 0) / Math.max(1, (issues?.rows ?? []).length))}
          peak={Math.max(0, ...(issues?.rows ?? []).map((r) => r.count))}
          color="#EF4444" type="line"
          data={(issues?.rows ?? []).map((r) => ({ x: r.code, y: r.count }))} />
        <ChartCard title="Orders trend" subtitle="Daily order volume"
          total={overview?.orders.total ?? 0} avg={overview?.orders.avg ?? 0} peak={overview?.orders.peak ?? 0}
          color="#3B82F6" type="area"
          data={(overview?.orders.data ?? []).map((r) => ({ x: r.day.slice(5), y: r.y }))} />
        <ChartCard title="Dish error rate" subtitle="Percentage of orders with at least one tag"
          total={Math.round(((dishStats?.rows ?? []).reduce((a, d) => a + (d.orders ? d.errors / d.orders : 0), 0) / Math.max(1, (dishStats?.rows ?? []).length)) * 100)}
          avg={Math.round(((dishStats?.rows ?? []).reduce((a, d) => a + (d.orders ? d.errors / d.orders : 0), 0) / Math.max(1, (dishStats?.rows ?? []).length)) * 100)}
          peak={Math.max(0, ...((dishStats?.rows ?? []).map((d) => (d.orders ? Math.round((d.errors / d.orders) * 100) : 0))))}
          color="#F59E0B" type="line"
          data={(dishStats?.rows ?? []).map((d) => ({ x: d.name.split(" ")[0], y: d.orders ? Math.round((d.errors / d.orders) * 100) : 0 }))} />
      </div>
    </>
  );
}