"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Camera, Check, ChevronLeft, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { type IssueTag } from "@/lib/mock-data";
import { api } from "@/lib/api";
import { getCapture, saveCapture, deleteCapture } from "@/lib/captures";
import dishImages from "@/lib/dish-images.json";
import { cn, cldThumb } from "@/lib/utils";

type ItemDetail = {
  id: number; quantity: number; dish_id: number; dish: string;
  expected_grams: number; reference_image: string | null;
  monitored_tags: IssueTag[]; category: string; ai_criteria: string | null;
  order_code: string; restaurant: string;
  eval_image?: string | null; eval_score?: number | null; eval_status?: "Pass" | "Warn" | "Fail" | null; eval_notes?: string | null; eval_weight?: number | null;
};

type CriterionResult = { criterion: string; pass: boolean; reason: string };
type ScoreResult = {
  identifiedAs?: string; matchesExpected?: boolean;
  criteria?: CriterionResult[]; overallScore?: number;
  verdict?: "Pass" | "Warn" | "Fail"; summary?: string;
};

const VERDICT: Record<string, { bg: string; fg: string }> = {
  Pass: { bg: "#EAF3DE", fg: "#27500A" },
  Warn: { bg: "#FAEEDA", fg: "#633806" },
  Fail: { bg: "#FCEBEB", fg: "#791F1F" },
};

function parseCriteria(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { const a = JSON.parse(raw); if (Array.isArray(a)) return a.map((x) => String(x)); } catch {}
  return [];
}

export default function EvaluatePage() {
  const params = useParams<{ orderId: string; itemId: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const dishParam = search.get("dish");
  const qc = useQueryClient();
  const itemId = parseInt(params.itemId, 10);
  const orderId = params.orderId;

  const { data: item } = useQuery({
    queryKey: ["item", itemId],
    queryFn: () => api<ItemDetail>(`/api/kds/order-item/${itemId}`),
    retry: false,
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>("");
  const [streamErr, setStreamErr] = useState<string | null>(null);
  const [camNonce, setCamNonce] = useState(0);

  const [weight, setWeight] = useState<number>(0);
  const [capturedWeight, setCapturedWeight] = useState<number>(0); // scale reading locked at the moment of capture

  const [captured, setCaptured] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<ScoreResult | null>(null);
  const [scoring, setScoring] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        const list = await navigator.mediaDevices.enumerateDevices();
        const cams = list.filter((d) => d.kind === "videoinput");
        const initialId = probe.getVideoTracks()[0]?.getSettings().deviceId ?? cams[0]?.deviceId ?? "";
        probe.getTracks().forEach((t) => t.stop());
        if (cancelled) return;
        setDevices(cams);
        setActiveDeviceId(initialId);
      } catch (err: any) {
        if (!cancelled) setStreamErr(err?.message ?? "Could not access webcam.");
      }
    })();
    return () => { cancelled = true; stopStream(); };
  }, []);

  useEffect(() => {
    if (!activeDeviceId) return;
    let cancelled = false;
    stopStream();
    navigator.mediaDevices
      .getUserMedia({ video: { deviceId: { exact: activeDeviceId } }, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
      })
      .catch((err) => { if (!cancelled) setStreamErr(err?.message ?? "Camera error"); });
    return () => { cancelled = true; stopStream(); };
  }, [activeDeviceId, camNonce]);

  // Release the single webcam when this tab is backgrounded so the config tab can use
  // it; re-acquire (after a short delay to let the other tab let go) when we return.
  useEffect(() => {
    let t: any;
    const onVis = () => {
      if (document.hidden) stopStream();
      else t = setTimeout(() => setCamNonce((n) => n + 1), 400);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); clearTimeout(t); };
  }, []);

  // Live weight from the Pi load-cell service (http://127.0.0.1:8765/weight on the
  // machine). Falls back to a simulated reading if that service is not reachable
  // (e.g. during local development on a laptop).
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_WEIGHT_URL || "http://127.0.0.1:8765/weight";
    let active = true;
    const tick = async () => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          if (active && j?.ok && typeof j.weight_g === "number") {
            setWeight(j.weight_g);
            return;
          }
        }
      } catch {}
      // Weight service not reachable -> show 0 (never a fake number).
      if (active) setWeight(0);
    };
    const id = setInterval(tick, 500);
    tick();
    return () => { active = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    if (item?.eval_weight != null) setCapturedWeight(item.eval_weight); // restore the saved scale reading so it doesn't show 0 on reopen
    const local = getCapture(orderId, itemId)?.dataUrl ?? null;
    if (local) { setCaptured(local); return; }
    // No local photo (e.g. viewing a past order on another device) -> load the saved one from the DB.
    if (item?.eval_image) {
      setCaptured(item.eval_image);
      setAiResult({
        overallScore: item.eval_score ?? undefined,
        verdict: (item.eval_status as "Pass" | "Warn" | "Fail" | undefined) ?? undefined,
        summary: item.eval_notes ?? undefined,
      });
    }
  }, [orderId, itemId, item]);

  const DISH_IMAGES = dishImages as Record<string, string>;
  const dishName = item?.dish ?? dishParam ?? "";
  const expectedImg =
    item?.reference_image && (item.reference_image.startsWith("http") || item.reference_image.startsWith("data:"))
      ? item.reference_image
      : (dishName && DISH_IMAGES[dishName]) || null;

  function grabFrame(): string | null {
    const v = videoRef.current; const c = canvasRef.current;
    if (!v || !c) return null;
    const w = v.videoWidth || 640; const h = v.videoHeight || 480;
    c.width = w; c.height = h;
    const ctx = c.getContext("2d"); if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.85);
  }

  async function runScore(image: string) {
    setScoring(true); setScoreError(null); setAiResult(null);
    try {
      const res = await fetch("/api/score", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image,
          criteria: parseCriteria(item?.ai_criteria),
          dishName, category: item?.category, expectedGrams: item?.expected_grams,
        }),
      });
      const json = await res.json();
      if (!res.ok) setScoreError((json?.error ?? "Scoring failed") + (json?.detail ? `  —  ${json.detail}` : ""));
      else setAiResult(json.result as ScoreResult);
    } catch (e: any) {
      setScoreError("Request failed: " + (e?.message ?? "unknown"));
    } finally {
      setScoring(false);
    }
  }

  function handleCapture() {
    const d = grabFrame();
    if (!d) { toast.error("Camera not ready"); return; }
    setCapturedWeight(weight); // lock the scale reading at the instant the photo is taken
    saveCapture(orderId, itemId, d);
    setCaptured(d);
    toast.success("Photo captured — scoring…");
    runScore(d);
  }

  function handleRecapture() {
    const d = grabFrame();
    if (!d) { toast.error("Camera not ready"); return; }
    setCapturedWeight(weight); // re-lock the scale reading on recapture
    deleteCapture(orderId, itemId);
    saveCapture(orderId, itemId, d);
    setCaptured(d);
    setAiResult(null);
    runScore(d);
  }

  // The weight that matters is the reading captured at photo time, not whatever the scale
  // shows later (the plate is usually removed before the user clicks save).
  const displayWeight = captured ? capturedWeight : weight;
  const weightOk = item ? Math.abs(displayWeight - item.expected_grams) <= item.expected_grams * 0.15 : null;

  async function saveEvaluation() {
    if (!aiResult) return;
    setSaving(true);
    try {
      if (item) {
        // Real order item -> store an evaluation that feeds the dashboards.
        const r = await fetch("/api/evaluate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderItemId: itemId,
            score: aiResult.overallScore ?? 0,
            status: aiResult.verdict ?? (((aiResult.overallScore ?? 0) >= 85) ? "Pass" : (aiResult.overallScore ?? 0) >= 70 ? "Warn" : "Fail"),
            weight_g: Math.round(capturedWeight),
            temperature_c: null,
            image: captured,
            notes: aiResult.summary ?? null,
            tags: [],
          }),
        });
        if (!r.ok) throw new Error("evaluation save failed");
      }
      // Always log the AI assessment.
      await fetch("/api/ai-scores", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dishId: item?.dish_id ?? null,
          dishName: item?.dish ?? dishName,
          score: aiResult.overallScore ?? null,
          verdict: aiResult.verdict ?? null,
          identifiedAs: aiResult.identifiedAs ?? null,
          matchesExpected: aiResult.matchesExpected ?? false,
          summary: aiResult.summary ?? null,
          criteria: parseCriteria(item?.ai_criteria),
        }),
      });
      qc.invalidateQueries({ queryKey: ["kds"] });
      qc.invalidateQueries({ queryKey: ["evaluations"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["ai-scores"] });
      toast.success("Evaluation saved");
      router.push("/orders/live");
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message ?? "unknown"}`);
    } finally {
      setSaving(false);
    }
  }

  const v = aiResult?.verdict && VERDICT[aiResult.verdict] ? VERDICT[aiResult.verdict] : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/orders/live" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ChevronLeft className="h-4 w-4" /> Back to KDS
        </Link>
        <div className="text-xs text-muted num">{item ? `${item.order_code} · ${item.restaurant}` : "—"}</div>
      </div>

      <h1 className="text-2xl font-bold tracking-tight">{item?.dish ?? dishParam ?? "Loading…"}</h1>

      <div className="rounded-card bg-white shadow-card p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <div>
            <span className="text-muted">Weight</span>{" "}
            <span className="num font-semibold">{Math.round(displayWeight)} g</span>
            {item && <span className="text-muted text-xs"> / target {item.expected_grams} g</span>}
            {weightOk !== null && (
              <span className={cn("ml-1 text-xs", weightOk ? "text-emerald-700" : "text-rose-700")}>
                {weightOk ? "✓" : "✗"}
              </span>
            )}
          </div>
          <div className="ml-auto">
            <label className="text-xs text-muted">Camera</label>
            <select value={activeDeviceId} onChange={(e) => setActiveDeviceId(e.target.value)} className="ml-2 rounded-btn border border-line text-sm bg-white px-2 py-1 focus-ring">
              {devices.length === 0 && <option value="">No camera detected</option>}
              {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 4)}`}</option>)}
            </select>
          </div>
        </div>

        <div className={cn("grid grid-cols-1 gap-4 mt-4", captured ? "md:grid-cols-3" : "md:grid-cols-2")}>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted mb-1.5">Expected image</div>
            <div className="aspect-video rounded-md bg-canvas border border-line overflow-hidden flex items-center justify-center">
              {expectedImg ? <img src={cldThumb(expectedImg)} alt="expected" className="w-full h-full object-cover" /> : <span className="text-muted text-sm">No reference image</span>}
            </div>
          </div>

          {captured && (
            <div>
              <div className="text-xs uppercase tracking-wider text-muted mb-1.5">Captured image</div>
              <div className="aspect-video rounded-md bg-canvas border border-line overflow-hidden flex items-center justify-center">
                <img src={captured} alt="captured" className="w-full h-full object-cover" />
              </div>
            </div>
          )}

          <div>
            <div className="text-xs uppercase tracking-wider text-muted mb-1.5">Live image</div>
            <div className="aspect-video rounded-md bg-black overflow-hidden relative">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              {streamErr && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-rose-300 px-4 text-center">
                  {streamErr}. Allow camera access in your browser, or pick a device above.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-center mt-4">
          {captured
            ? <button onClick={handleRecapture} disabled={!!streamErr || scoring} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-btn bg-ink text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"><RotateCcw className="h-4 w-4" /> Recapture</button>
            : <button onClick={handleCapture} disabled={!!streamErr} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-btn bg-ink text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"><Camera className="h-4 w-4" /> Capture</button>}
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* AI assessment */}
      {(scoring || aiResult || scoreError) && (
        <div className="rounded-card bg-white shadow-card p-5">
          <div className="flex items-center gap-2 font-semibold tracking-tight mb-3">
            <Sparkles className="h-4 w-4 text-brand-600" /> AI assessment
          </div>

          {scoring && <div className="text-sm text-muted">Analyzing the captured photo…</div>}
          {scoreError && <div className="rounded-md border border-rose-200 bg-rose-50 text-rose-700 text-xs p-3 whitespace-pre-wrap">{scoreError}</div>}

          {aiResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="text-4xl font-semibold tracking-tight">{aiResult.overallScore ?? "—"}</div>
                <div className="text-xs text-muted">/ 100 visual</div>
                {v && <span className="ml-auto text-xs font-medium px-3 py-1.5 rounded-full" style={{ background: v.bg, color: v.fg }}>{aiResult.verdict}</span>}
              </div>

              {aiResult.criteria && aiResult.criteria.length > 0 && (
                <div className="text-sm text-muted">
                  <span className="text-ink font-medium">{aiResult.criteria.filter((c) => c.pass).length}</span> of {aiResult.criteria.length} checks passed ({Math.round((aiResult.criteria.filter((c) => c.pass).length / aiResult.criteria.length) * 100)}%)
                </div>
              )}

              {/* hardware checks */}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-full", weightOk ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
                  Weight {Math.round(displayWeight)}g {weightOk ? "✓" : "✗"}
                </span>
              </div>

              {aiResult.summary && <div className="text-sm">{aiResult.summary}</div>}

              <div className="space-y-2">
                {(aiResult.criteria ?? []).map((c, i) => (
                  <div key={i} className="flex items-start gap-2 border border-line rounded-md p-2.5">
                    <span className={cn("shrink-0 h-5 w-5 rounded-full flex items-center justify-center mt-0.5", c.pass ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
                      {c.pass ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    </span>
                    <div>
                      <div className="text-sm font-medium">{c.criterion}</div>
                      <div className="text-xs text-muted mt-0.5">{c.reason}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button onClick={saveEvaluation} disabled={saving} className="px-4 py-2 rounded-btn bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
                  {saving ? "Saving…" : "Save evaluation & finish"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
