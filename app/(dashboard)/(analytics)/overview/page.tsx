"use client";

import Link from "next/link";
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardList } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { RefreshButton } from "@/components/refresh-button";
import { StatCard } from "@/components/stat-card";
import { ChartCard } from "@/components/chart-card";
import { useFilters } from "@/components/filter-context";
import { api, buildFilterQS } from "@/lib/api";

type Series = { total: number; avg: number; peak: number; data: { day: string; y: number }[] };
type OverviewResp = {
  kpis: { total: number; evaluated: number; missing: number; rate: number };
  evals: Series; orders: Series; errors: Series;
};

export default function OverviewPage() {
  const { applied } = useFilters();
  const qs = buildFilterQS(applied);
  const { data, isLoading } = useQuery({
    queryKey: ["overview", qs],
    queryFn: () => api<OverviewResp>(`/api/overview?${qs}`),
  });
  const k = data?.kpis ?? { total: 0, evaluated: 0, missing: 0, rate: 0 };

  return (
    <>
      <PageHeader title="Overview" subtitle="Food quality evaluation and analytics platform" actions={<RefreshButton />} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Link href="/orders" className="block focus-ring rounded-card transition hover:shadow-card-lg hover:-translate-y-0.5"><StatCard label="Total Orders" value={isLoading ? "-" : k.total} caption="In selected date range — view orders" Icon={ClipboardList} /></Link>
        <Link href="/evaluations" className="block focus-ring rounded-card transition hover:shadow-card-lg hover:-translate-y-0.5"><StatCard label="Orders Evaluated" value={isLoading ? "-" : k.evaluated} caption="Click to view evaluated orders" Icon={CheckCircle2} tone="success" /></Link>
        <StatCard label="Not Evaluated"    value={isLoading ? "-" : k.missing}   caption="Missing evaluations"     Icon={AlertTriangle} tone="danger" />
        <StatCard label="Evaluation Rate"  value={isLoading ? "-" : `${k.rate}%`} caption="Coverage rate"          Icon={BarChart3} tone={k.rate < 30 ? "danger" : "success"} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <ChartCard title="Evaluations Per Day" subtitle="Daily evaluation counts over time"
          total={data?.evals.total ?? 0} avg={data?.evals.avg ?? 0} peak={data?.evals.peak ?? 0}
          color="#3B82F6" type="line"
          data={(data?.evals.data ?? []).map((r) => ({ x: r.day.slice(5), y: r.y }))} />
        <ChartCard title="Orders Per Day" subtitle="Daily order volume over time"
          total={data?.orders.total ?? 0} avg={data?.orders.avg ?? 0} peak={data?.orders.peak ?? 0}
          color="#10B981" type="area"
          data={(data?.orders.data ?? []).map((r) => ({ x: r.day.slice(5), y: r.y }))} />
        <ChartCard title="Errors Per Day" subtitle="Daily error tag counts (NC, WG, ID, WP, NI, IM, CI)"
          total={data?.errors.total ?? 0} avg={data?.errors.avg ?? 0} peak={data?.errors.peak ?? 0}
          color="#EF4444" type="line"
          data={(data?.errors.data ?? []).map((r) => ({ x: r.day.slice(5), y: r.y }))} />
      </div>
    </>
  );
}