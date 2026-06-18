"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type FilterState = {
  restaurant: string;
  startDate: string;
  endDate: string;
  evaluationStatus: string;
  scoreStatus: string;
};

// Compute "today" fresh each time defaults are read so the date always reflects
// the day the app is opened (not a value frozen at build time).
const fmt = (d: Date) => {
  // Use local date parts (avoids the UTC shift that toISOString() can introduce).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const todayStr = () => fmt(new Date());

const makeDefault = (): FilterState => ({
  restaurant: "All Restaurants",
  startDate: "",
  endDate: "",
  evaluationStatus: "All Statuses",
  scoreStatus: "All Scores",
});

const DEFAULT: FilterState = makeDefault();

type Ctx = {
  draft: FilterState;
  applied: FilterState;
  setDraft: (patch: Partial<FilterState>) => void;
  apply: () => void;
  reset: () => void;
  clearFilter: (key: keyof FilterState) => void;
  activeChips: { key: keyof FilterState; label: string }[];
};

const FilterCtx = createContext<Ctx | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [draft, setDraftState] = useState<FilterState>(makeDefault);
  const [applied, setApplied] = useState<FilterState>(makeDefault);

  const setDraft = (patch: Partial<FilterState>) =>
    setDraftState((d) => ({ ...d, ...patch }));
  const apply = () => setApplied(draft);
  const reset = () => {
    setDraftState(makeDefault());
    setApplied(makeDefault());
  };

  // Remove a single filter. Dates clear to "" (no bound); others fall back to default.
  const clearFilter = (key: keyof FilterState) => {
    const cleared = key === "startDate" || key === "endDate" ? "" : DEFAULT[key];
    setDraftState((d) => ({ ...d, [key]: cleared }));
    setApplied((a) => ({ ...a, [key]: cleared }));
  };

  const activeChips = useMemo(() => {
    const chips: { key: keyof FilterState; label: string }[] = [];
    if (applied.restaurant !== DEFAULT.restaurant)
      chips.push({ key: "restaurant", label: applied.restaurant });
    const fmtDDMM = (s: string) => s.split("-").reverse().join("/");
    if (applied.startDate)
      chips.push({ key: "startDate", label: `From: ${fmtDDMM(applied.startDate)}` });
    if (applied.endDate)
      chips.push({ key: "endDate", label: `To: ${fmtDDMM(applied.endDate)}` });
    if (applied.evaluationStatus !== DEFAULT.evaluationStatus)
      chips.push({ key: "evaluationStatus", label: applied.evaluationStatus });
    if (applied.scoreStatus !== DEFAULT.scoreStatus)
      chips.push({ key: "scoreStatus", label: applied.scoreStatus });
    return chips;
  }, [applied]);

  return (
    <FilterCtx.Provider value={{ draft, applied, setDraft, apply, reset, clearFilter, activeChips }}>
      {children}
    </FilterCtx.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FilterCtx);
  if (!ctx) throw new Error("useFilters must be used inside FilterProvider");
  return ctx;
}
