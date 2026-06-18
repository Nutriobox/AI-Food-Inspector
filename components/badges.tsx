import { cn } from "@/lib/utils";
import { TAG_GLOSSARY, type EvalStatus, type IssueTag, type ScoreStatus } from "@/lib/mock-data";

export function ScoreBadge({ score }: { score: ScoreStatus }) {
  const map: Record<ScoreStatus, string> = {
    Pass: "bg-brand-50 text-brand-700",
    Warn: "bg-amber-50 text-amber-700",
    Fail: "bg-rose-50 text-rose-700",
    "—": "text-muted",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", map[score])}>
      {score}
    </span>
  );
}

export function StatusBadge({ status }: { status: EvalStatus }) {
  const map: Record<EvalStatus, string> = {
    Evaluated: "bg-brand-50 text-brand-700",
    "Not Evaluated": "bg-rose-50 text-rose-700",
    Disputed: "bg-amber-50 text-amber-700",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", map[status])}>
      {status}
    </span>
  );
}

export function TagBadge({ tag }: { tag: IssueTag }) {
  return (
    <span title={TAG_GLOSSARY[tag]} className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 mr-1">
      {tag}
    </span>
  );
}

export function NumericScore({ score }: { score: number }) {
  const cls = score >= 85 ? "text-brand-600" : score >= 70 ? "text-warn-500" : "text-danger-500";
  return <span className={cn("num font-semibold", cls)}>{score}</span>;
}
