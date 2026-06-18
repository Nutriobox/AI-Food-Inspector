/**
 * Configuration-completeness status for a dish.
 *
 * A dish is "configured" when it has everything required to be monitored:
 *   1. an expected image (reference_image)
 *   2. an item description
 *
 * - configured     -> both present
 * - partial        -> exactly one present
 * - not_configured -> neither present
 */
export type DishStatus = "configured" | "partial" | "not_configured";

export type DishConfigFields = {
  reference_image?: string | null;
  description?: string | null;
};

function filled(v?: string | null): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

export function dishStatus(d: DishConfigFields): DishStatus {
  const parts = [filled(d.reference_image), filled(d.description)];
  const done = parts.filter(Boolean).length;
  if (done === 2) return "configured";
  if (done === 0) return "not_configured";
  return "partial";
}

export const STATUS_META: Record<
  DishStatus,
  { label: string; bg: string; fg: string; bar: string; dot: string }
> = {
  configured: { label: "Configured", bg: "#EAF3DE", fg: "#27500A", bar: "#639922", dot: "#639922" },
  partial: { label: "Partially", bg: "#FAEEDA", fg: "#633806", bar: "#EF9F27", dot: "#EF9F27" },
  not_configured: { label: "Not configured", bg: "#FCEBEB", fg: "#791F1F", bar: "#E24B4A", dot: "#E24B4A" },
};
