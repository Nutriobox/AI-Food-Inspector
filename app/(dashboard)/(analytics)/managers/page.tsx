"use client";

import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { RefreshButton } from "@/components/refresh-button";
import { DataTable, type Column } from "@/components/data-table";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type ManagerRow = { id: number; name: string; restaurant: string; evals: number; errors: number; score: number };

const columns: Column<ManagerRow>[] = [
  {
    key: "name", header: "Manager",
    render: (m) => (
      <div className="flex items-center gap-2">
        <span className="h-7 w-7 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-xs font-semibold">
          {m.name.split(" ").map((p) => p[0]).join("")}
        </span>
        <span className="font-medium">{m.name}</span>
      </div>
    ),
  },
  { key: "restaurant", header: "Restaurant" },
  { key: "evals", header: "Evaluations", render: (m) => <span className="num">{m.evals}</span> },
  { key: "errors", header: "Errors flagged", render: (m) => <span className="num text-danger-500">{m.errors}</span> },
  {
    key: "score", header: "Avg score",
    render: (m) => <span className={cn("num font-semibold", m.score >= 85 ? "text-brand-600" : "text-warn-500")}>{m.score}</span>,
  },
];

export default function ManagersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["managers"],
    queryFn: () => api<{ rows: ManagerRow[] }>("/api/managers"),
  });
  return (
    <>
      <PageHeader title="Managers" subtitle="Per-manager evaluation performance" actions={<RefreshButton />} />
      {isLoading ? (
        <div className="rounded-card bg-white shadow-card p-8 text-center text-muted text-sm">Loading…</div>
      ) : (
        <DataTable columns={columns} rows={data?.rows ?? []} />
      )}
    </>
  );
}