"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, Sparkles, Check, X } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Dish = {
  id: number;
  name: string;
  category: string;
  expected_grams: number;
  ai_criteria: string | null;
};

type CriterionResult = { criterion: string; pass: boolean; reason: string };
type ScoreResult = {
  identifiedAs?: string;
  matchesExpected?: boolean;
  criteria?: CriterionResult[];
  overallScore?: number;
  verdict?: "Pass" | "Warn" | "Fail";
  summary?: string;
};

type ScoreRow = {
  id: number;
  dish_name: string | null;
  score: number | null;
  verdict: string | null;
  summary: string | null;
  matches_expected: number | null;
  created_at: string;
};

function parseCriteria(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const a = JSON.parse(raw);
    if (Array.isArray(a)) return a.map((x) => String(x));
  } catch {}
  return [];
}

const VERDICT: Record<string, { bg: string; fg: string }> = {
  Pass: { bg: "#EAF3DE", fg: "#27500A" },
  Warn: { bg: "#FAEEDA", fg: "#633806" },
  Fail: { bg: "#FCEBEB", fg: "#791F1F" },
};

export default function AiTestPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["dishes-list"],
    queryFn: () => api<{ rows: Dish[] }>("/api/dishes"),
  });
  const dishes = data?.rows ?? [];

  const history = useQuery({
    queryKey: ["ai-scores"],
    queryFn: () => api<{ rows: ScoreRow[] }>("/api/ai-scores"),
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const [dishId, setDishId] = useState<number | null>(null);
  const [criteriaText, setCriteriaText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScoreResult | null>(null);

  const selected = useMemo(() => dishes.find((d) => d.id === dishId) ?? null, [dishes, dishId]);

  function pickDish(id: number) {
    setDishId(id);
    const d = dishes.find((x) => x.id === id);
    setCriteriaText(parseCriteria(d?.ai_criteria ?? null).join("\n"));
    setResult(null);
    setError(null);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      setError("Image too large (max 4 MB). Use a smaller photo.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImage(reader.result as string);
      setResult(null);
      setError(null);
    };
    reader.readAsDataURL(file);
  }

  async function run() {
    if (!image) {
      setError("Upload a food photo first.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    const criteria = criteriaText.split("\n").map((s) => s.trim()).filter(Boolean);
    try {
      const res = await fetch("/api/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image,
          criteria,
          dishName: selected?.name,
          category: selected?.category,
          expectedGrams: selected?.expected_grams,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError((json?.error ?? "Scoring failed") + (json?.detail ? `  —  ${json.detail}` : ""));
        return;
      }
      const r = json.result as ScoreResult;
      setResult(r);
      // Save the result to history (fire-and-forget).
      fetch("/api/ai-scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dishId: selected?.id ?? null,
          dishName: selected?.name ?? r.identifiedAs ?? null,
          score: r.overallScore ?? null,
          verdict: r.verdict ?? null,
          identifiedAs: r.identifiedAs ?? null,
          matchesExpected: r.matchesExpected ?? false,
          summary: r.summary ?? null,
          criteria,
        }),
      }).then(() => qc.invalidateQueries({ queryKey: ["ai-scores"] }));
    } catch (e: any) {
      setError("Request failed: " + (e?.message ?? "unknown error"));
    } finally {
      setLoading(false);
    }
  }

  const v = result?.verdict && VERDICT[result.verdict] ? VERDICT[result.verdict] : null;
  const rows = history.data?.rows ?? [];

  return (
    <>
      <PageHeader title="AI scoring — test bench" subtitle="Upload a food photo and score it against an item's AI criteria (Gemini). Every check is saved below." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-card bg-white shadow-card p-5 space-y-4">
          <label className="block text-xs font-medium text-muted">
            Item
            <select
              value={dishId ?? ""}
              onChange={(e) => pickDish(Number(e.target.value))}
              className="mt-1 block w-full rounded-btn border border-line text-sm bg-white px-2 py-1.5 focus-ring"
            >
              <option value="" disabled>Select an item…</option>
              {dishes.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium text-muted">
            AI criteria (one per line)
            <textarea
              value={criteriaText}
              onChange={(e) => setCriteriaText(e.target.value)}
              rows={5}
              placeholder="Pick an item to load its criteria, or type checks here — one per line."
              className="mt-1 block w-full rounded-btn border border-line text-sm bg-white px-2 py-1.5 focus-ring resize-y"
            />
          </label>

          <div>
            <div className="text-xs font-medium text-muted mb-2">Food photo</div>
            <div className="w-full aspect-video rounded-md border border-line bg-canvas overflow-hidden flex items-center justify-center text-muted">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="text-[11px]">No photo selected</span>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              className="mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-btn border border-line bg-white text-xs font-medium hover:bg-canvas"
            >
              <Upload className="h-3.5 w-3.5" /> Upload photo
            </button>
          </div>

          <button
            onClick={run}
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-btn bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" /> {loading ? "Scoring…" : "Run AI check"}
          </button>
        </section>

        <section className="rounded-card bg-white shadow-card p-5">
          <div className="font-semibold tracking-tight mb-3">Result</div>

          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 text-rose-700 text-xs p-3 whitespace-pre-wrap">{error}</div>
          )}

          {!error && !result && (
            <div className="text-sm text-muted">Pick an item, upload a photo, and run the check to see the AI's report here.</div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="text-4xl font-semibold tracking-tight">{result.overallScore ?? "—"}</div>
                <div className="text-xs text-muted">/ 100</div>
                {v && (
                  <span className="ml-auto text-xs font-medium px-3 py-1.5 rounded-full" style={{ background: v.bg, color: v.fg }}>
                    {result.verdict}
                  </span>
                )}
              </div>

              <div className="text-xs text-muted">
                Identified as: <span className="text-ink font-medium">{result.identifiedAs ?? "—"}</span>
                {" · "}
                {result.matchesExpected ? (
                  <span className="text-emerald-700">matches expected item</span>
                ) : (
                  <span className="text-rose-700">does not match expected item</span>
                )}
              </div>

              {result.summary && <div className="text-sm">{result.summary}</div>}

              <div className="space-y-2">
                {(result.criteria ?? []).map((c, i) => (
                  <div key={i} className="flex items-start gap-2 border border-line rounded-md p-2.5">
                    <span
                      className={cn(
                        "shrink-0 h-5 w-5 rounded-full flex items-center justify-center mt-0.5",
                        c.pass ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                      )}
                    >
                      {c.pass ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    </span>
                    <div>
                      <div className="text-sm font-medium">{c.criterion}</div>
                      <div className="text-xs text-muted mt-0.5">{c.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="rounded-card bg-white shadow-card mt-4">
        <div className="px-5 py-3 border-b border-line font-semibold tracking-tight">Recent AI checks</div>
        {rows.length === 0 ? (
          <div className="p-5 text-sm text-muted">No checks yet — run one above and it will appear here.</div>
        ) : (
          <div className="divide-y divide-line">
            {rows.map((r) => {
              const vv = r.verdict && VERDICT[r.verdict] ? VERDICT[r.verdict] : null;
              return (
                <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="w-10 text-lg font-semibold tabular-nums">{r.score ?? "—"}</div>
                  {vv && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: vv.bg, color: vv.fg }}>
                      {r.verdict}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{r.dish_name ?? "—"}</div>
                    <div className="text-xs text-muted truncate">{r.summary ?? ""}</div>
                  </div>
                  <div className="text-[11px] text-muted whitespace-nowrap">{r.created_at}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
