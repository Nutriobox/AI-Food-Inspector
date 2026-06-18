import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "danger" | "warn";

const valueTone: Record<Tone, string> = {
  neutral: "text-ink",
  success: "text-brand-600",
  danger: "text-danger-500",
  warn: "text-warn-500",
};
const iconTone: Record<Tone, string> = {
  neutral: "bg-canvas text-muted",
  success: "bg-brand-50 text-brand-600",
  danger: "bg-rose-50 text-danger-500",
  warn: "bg-amber-50 text-warn-500",
};

export function StatCard({
  label,
  value,
  caption,
  Icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  caption?: string;
  Icon: LucideIcon;
  tone?: Tone;
}) {
  return (
    <div className="rounded-card bg-white shadow-card p-5 flex flex-col">
      <div className="flex items-start justify-between">
        <div className="text-sm text-muted">{label}</div>
        <div className={cn("h-7 w-7 rounded-md flex items-center justify-center", iconTone[tone])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className={cn("num text-4xl font-bold tracking-tight mt-3", valueTone[tone])}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {caption && <div className="text-xs text-muted mt-2">{caption}</div>}
    </div>
  );
}