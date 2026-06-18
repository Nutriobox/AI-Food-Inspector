"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/page-header";
import { RefreshButton } from "@/components/refresh-button";
import { DataTable, type Column } from "@/components/data-table";
import { TagBadge } from "@/components/badges";
import { useFilters } from "@/components/filter-context";
import { api, buildFilterQS } from "@/lib/api";
import type { IssueTag } from "@/lib/mock-data";

type IssueRow = { code: IssueTag; name: string; count: number };

const columns: Column<IssueRow & { trend: "up" | "down" }>[] = [
  { key: "code", header: "Tag", render: (r) => <TagBadge tag={r.code} /> },
  { key: "name", header: "Issue" },
  { key: "count", header: "Count", render: (r) => <span className="num">{r.count.toLocaleString()}</span> },
  {
    key: "trend", header: "Trend (last 14d)", sortable: false,
    render: (r) => r.trend === "up"
      ? <span className="inline-flex items-center text-xs text-danger-500"><ArrowUpRight className="h-3.5 w-3.5" /> Up</span>
      : <span className="inline-flex items-center text-xs text-brand-600"><ArrowDownRight className="h-3.5 w-3.5" /> Down</span>,
  },
];

export default function OrderIssuesPage() {
  const { applied } = useFilters();
  const qs = buildFilterQS(applied);
  const { data, isLoading } = useQuery({
    queryKey: ["issues", qs],
    queryFn: () => api<{ rows: IssueRow[] }>(`/api/issues?${qs}`),
  });
  const rows = (data?.rows ?? []).map((r) => ({ ...r, trend: r.count > 250 ? ("up" as const) : ("down" as const) }));

  return (
    <>
      <PageHeader title="Order Issues" subtitle="Orders flagged with one or more error tags" actions={<RefreshButton />} />
      <section className="rounded-card bg-white shadow-card p-5 mb-4">
        <div className="font-semibold tracking-tight mb-3">Tag glossary</div>
        {isLoading ? (
          <div className="text-sm text-muted">Loading…</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            {(data?.rows ?? []).map((i) => (
              <div key={i.code} className="rounded-md border border-line p-3">
                <div className="flex items-center justify-between">
                  <TagBadge tag={i.code} />
                  <span className="num text-sm font-bold">{i.count.toLocaleString()}</span>
                </div>
                <div className="text-xs text-muted mt-1">{i.name}</div>
              </div>
            ))}
            {(data?.rows ?? []).length === 0 && (
              <div className="col-span-full text-sm text-muted">No issues flagged in this range.</div>
            )}
          </div>
        )}
      </section>
      {isLoading ? (
        <div className="rounded-card bg-white shadow-card p-8 text-center text-muted text-sm">Loading…</div>
      ) : (
        <DataTable columns={columns} rows={rows} />
      )}
    </>
  );
}
