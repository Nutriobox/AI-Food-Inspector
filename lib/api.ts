/**
 * Tiny typed wrapper around fetch + helpers to build query strings from filter state.
 */
import type { FilterState } from "@/components/filter-context";

export function buildFilterQS(f: FilterState) {
  const sp = new URLSearchParams();
  if (f.restaurant && f.restaurant !== "All Restaurants") sp.set("restaurant", f.restaurant);
  if (f.startDate) sp.set("startDate", f.startDate);
  if (f.endDate) sp.set("endDate", f.endDate);
  if (f.evaluationStatus && f.evaluationStatus !== "All Statuses")
    sp.set("evaluationStatus", f.evaluationStatus);
  if (f.scoreStatus && f.scoreStatus !== "All Scores") sp.set("scoreStatus", f.scoreStatus);
  return sp.toString();
}

export async function api<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}
