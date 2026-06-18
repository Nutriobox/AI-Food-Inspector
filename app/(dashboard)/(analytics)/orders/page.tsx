"use client";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { RefreshButton } from "@/components/refresh-button";
import { DataTable } from "@/components/data-table";
import { ScoreBadge, StatusBadge } from "@/components/badges";
import { useFilters } from "@/components/filter-context";
import { api, buildFilterQS } from "@/lib/api";

export default function OrdersPage() {
  const { applied } = useFilters();
  const qs = buildFilterQS(applied);
  const q = useQuery({
    queryKey: ["orders", qs],
    queryFn: () => api(`/api/orders?${qs}`),
  });
  const rows = (q["data"]?.["rows"]) ?? [];

  const columns = [
    { key: "id", header: "Order" },
    { key: "time", header: "Time" },
    { key: "restaurant", header: "Restaurant" },
    { key: "dish", header: "Dish" },
    { key: "score", header: "Score", render: (r) => <ScoreBadge score={r["score"]} /> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r["status"]} /> },
    { key: "manager", header: "Manager" },
  ];

  return (
    <>
      <PageHeader title="Recent Orders" subtitle="Every order, filtered by your selection" actions={<RefreshButton />} />
      {q["isLoading"] ? (
        <div className="rounded-card bg-white shadow-card p-8 text-center text-muted text-sm">Loading</div>
      ) : (
        <DataTable columns={columns} rows={rows} />
      )}
    </>
  );
}