"use client";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { RefreshButton } from "@/components/refresh-button";
import { DataTable } from "@/components/data-table";
import { NumericScore, TagBadge } from "@/components/badges";
import { useFilters } from "@/components/filter-context";
import { api, buildFilterQS } from "@/lib/api";

export default function EvaluationsPage() {
  const { applied } = useFilters();
  const qs = buildFilterQS(applied);
  const q = useQuery({
    queryKey: ["evaluations", qs],
    queryFn: () => api(`/api/evaluations?${qs}`),
  });
  const rows = (q["data"]?.["rows"]) ?? [];

  const columns = [
    { key: "id", header: "Evaluation" },
    { key: "time", header: "Time" },
    { key: "dish", header: "Dish" },
    { key: "score", header: "Score", render: (r) => <NumericScore score={r["score"]} /> },
    {
      key: "tags", header: "Tags", sortable: false,
      render: (r) => {
        const tags = r["tags"] ?? [];
        if (tags["length"] === 0) return <span className="text-muted">none</span>;
        return <div>{tags.map((t) => <TagBadge key={t} tag={t} />)}</div>;
      },
    },
    { key: "manager", header: "Manager" },
  ];

  return (
    <>
      <PageHeader title="Evaluations" subtitle="Completed evaluations and their scores" actions={<RefreshButton />} />
      {q["isLoading"] ? (
        <div className="rounded-card bg-white shadow-card p-8 text-center text-muted text-sm">Loading</div>
      ) : (
        <DataTable columns={columns} rows={rows} />
      )}
    </>
  );
}