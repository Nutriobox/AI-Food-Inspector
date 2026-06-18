"use client";

import { ChevronDown, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useFilters } from "./filter-context";
import { api } from "@/lib/api";

const inputCls =
  "mt-1 block w-full rounded-btn border border-line bg-white px-2 py-1.5 text-sm focus-ring";

export function FilterBar() {
  const { draft, setDraft, apply, reset, clearFilter, activeChips } = useFilters();

  const { data: restos } = useQuery({
    queryKey: ["restaurants-list"],
    queryFn: () => api<{ rows: { id: number; name: string }[] }>("/api/restaurants?mode=list"),
  });
  const restoNames = ["All Restaurants", ...(restos?.rows ?? []).map((r) => r.name)];

  return (
    <section className="rounded-card bg-white shadow-card p-4 mb-4">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
        <label className="block text-xs font-medium text-muted">
          Restaurant
          <select className={inputCls} value={draft.restaurant} onChange={(e) => setDraft({ restaurant: e.target.value })}>
            {restoNames.map((r) => (<option key={r}>{r}</option>))}
          </select>
        </label>
        <label className="block text-xs font-medium text-muted">
          Start Date
          <input type="date" className={inputCls} value={draft.startDate} onChange={(e) => setDraft({ startDate: e.target.value })} />
        </label>
        <label className="block text-xs font-medium text-muted">
          End Date
          <input type="date" className={inputCls} value={draft.endDate} onChange={(e) => setDraft({ endDate: e.target.value })} />
        </label>
        <label className="block text-xs font-medium text-muted">
          Evaluation Status
          <select className={inputCls} value={draft.evaluationStatus} onChange={(e) => setDraft({ evaluationStatus: e.target.value })}>
            <option>All Statuses</option><option>Evaluated</option><option>Not Evaluated</option><option>Disputed</option>
          </select>
        </label>
        <label className="block text-xs font-medium text-muted">
          Score Status
          <select className={inputCls} value={draft.scoreStatus} onChange={(e) => setDraft({ scoreStatus: e.target.value })}>
            <option>All Scores</option><option>Pass</option><option>Warn</option><option>Fail</option>
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { apply(); toast("Filters applied"); }}
            className="px-3 py-2 rounded-btn bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium focus-ring"
          >
            Apply Filters
          </button>
          <button
            onClick={() => { reset(); toast("Filters reset"); }}
            className="px-3 py-2 rounded-btn border border-line bg-white text-xs font-medium hover:bg-canvas focus-ring"
          >
            Reset
          </button>
          <button
            onClick={() => toast("More filters coming soon")}
            className="px-2 py-2 text-xs font-medium text-muted hover:text-ink flex items-center gap-1 focus-ring"
          >
            More <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {activeChips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Active Filters:</span>
          {activeChips.map((c) => (
            <span key={c.key + c.label} className="inline-flex items-center gap-1 bg-chip text-brand-700 rounded-full px-2.5 py-1 font-medium">
              {c.label}
              <button
                type="button"
                aria-label={`Remove ${c.label}`}
                onClick={() => { clearFilter(c.key); toast("Filter removed"); }}
                className="inline-flex items-center justify-center rounded-full hover:bg-brand-700/10 focus-ring"
              >
                <X className="h-3 w-3 cursor-pointer" />
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
