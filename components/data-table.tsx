"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: keyof T & string;
  header: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
  className?: string;
};

type Props<T extends object> = {
  columns: Column<T>[];
  rows: T[];
  pageSize?: number;
};

export function DataTable<T extends object>({ columns, rows, pageSize = 10 }: Props<T>) {
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) =>
      Object.values(r as Record<string, unknown>).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [rows, query]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] as unknown;
      const bv = b[sortKey] as unknown;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const start = page * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));

  return (
    <div className="rounded-card bg-white shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(0); }}
          placeholder="Search…"
          className="text-sm rounded-btn border border-line bg-canvas px-3 py-1.5 focus-ring w-64"
        />
        <div className="text-xs text-muted">{sorted.length.toLocaleString()} {sorted.length === 1 ? "row" : "rows"}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-canvas">
            <tr>
              {columns.map((c) => {
                const active = sortKey === c.key;
                return (
                  <th
                    key={c.key}
                    className={cn("text-left text-xs font-medium text-muted px-4 py-3 whitespace-nowrap select-none", c.sortable !== false && "cursor-pointer")}
                    onClick={() => {
                      if (c.sortable === false) return;
                      if (active) setSortDir(sortDir === "asc" ? "desc" : "asc");
                      else { setSortKey(c.key); setSortDir("asc"); }
                    }}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.header}
                      {c.sortable !== false && (active ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 text-line" />)}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, i) => (
              <tr key={i} className={cn("border-t border-line", i % 2 === 1 && "bg-[#FBFAF7]")}>
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-4 py-3 text-sm whitespace-nowrap", c.className)}>
                    {c.render ? c.render(row) : (row[c.key] as ReactNode)}
                  </td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-muted">No matching rows</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-4 py-3 border-t border-line text-xs text-muted">
        <span>Page {page + 1} of {totalPages}</span>
        <div className="flex items-center gap-1">
          <button disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="px-2 py-1 rounded-btn border border-line hover:bg-canvas disabled:opacity-40">Prev</button>
          <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} className="px-2 py-1 rounded-btn border border-line hover:bg-canvas disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  );
}
