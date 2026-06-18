"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Camera, ChevronLeft, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TAG_GLOSSARY, type IssueTag } from "@/lib/mock-data";
import { api, apiPost } from "@/lib/api";
import { getCapture, saveCapture, deleteCapture } from "@/lib/captures";
import dishImages from "@/lib/dish-images.json";
import { cn } from "@/lib/utils";

type ItemDetail = {
  id: number; quantity: number; dish_id: number; dish: string;
  expected_grams: number; reference_image: string | null;
  monitored_tags: IssueTag[]; order_code: string; restaurant: string;
};

export default function EvaluatePage() {
  const params = useParams<{ orderId: string; itemId: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const dishParam = search.get("dish"); // fallback dish name passed from the KDS card
  const qc = useQueryClient();
  const itemId = parseInt(params.itemId, 10);

  const { data: item } = useQuery({
    queryKey: ["item", itemId],
    queryFn: () => api<ItemDetail>(`/api/kds/order-item/${itemId}`),
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>("");
  const [streamErr, setStreamErr] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);

  const [weight, setWeight] = useState<number>(0);
  const [temp, setTemp] = useState<number>(0);

  const [score, setScore] = useState<number>(85);
  const [tags, setTags] = useState<Set<IssueTag>>(new Set());
  const [notes, setNotes] = useState("");

  // Fully stop and release any active camera stream.
  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  // Enumerate cameras once and pick a default device.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        const list = await navigator.mediaDevices.enumerateDevices();
        const cams = list.filter((d) => d.kind === "videoinput");
        const initialId = probe.getVideoTracks()[0]?.getSettings().deviceId ?? cams[0]?.deviceId ?? "";
        // Release the probe stream; the device effect opens the real one.
        probe.getTracks().forEach((t) => t.stop());
        if (cancelled) return;
        setDevices(cams);
        setActiveDeviceId(initialId);
      } catch (err: any) {
        if (!cancelled) setStreamErr(err?.message ?? "Could not access webcam.");
      }
    })();
    // Safety net: ensure the camera is off when leaving the page.
    return () => { cancelled = true; stopStream(); };
  }, []);

  // Open the stream for the selected device; release it on change/unmount.
  useEffect(() => {
    if (!activeDeviceId) return;
    let cancelled = false;
    stopStream();
    navigator.mediaDevices
      .getUserMedia({ video: { deviceId: { exact: activeDeviceId } }, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch((err) => { if (!cancelled) setStreamErr(err?.message ?? "Camera error"); });
    return () => { cancelled = true; stopStream(); };
  }, [activeDeviceId]);

  useEffect(() => {
    const id = setInterval(() => {
      setWeight((w) => Math.max(0, Math.min(500, w + Math.round((Math.random() - 0.5) * 8))));
      setTemp((t) => Math.max(0, Math.min(95, t + (Math.random() - 0.5) * 1.2)));
    }, 800);
    return () => clearInterval(id);
  }, []);

  const orderId = params.orderId;
  // Previously captured photo for this order+item (null if none yet).
  const [captured, setCaptured] = useState<string | null>(null);
  useEffect(() => {
    setCaptured(getCapture(orderId, itemId)?.dataUrl ?? null);
  }, [orderId, itemId]);

  // Expected image: from the DB dish record, else looked up by dish name from
  // the QA dish-image map (so it works for sample orders too).
  const DISH_IMAGES = dishImages as Record<string, string>;
  const dishName = item?.dish ?? dishParam ?? "";
  const expectedImg =
    item?.reference_image && (item.reference_image.startsWith("http") || item.reference_image.startsWith("data:"))
      ? item.reference_image
      : (dishName && DISH_IMAGES[dishName]) || null;

  // Grab the current live frame as a JPEG data URL.
  function grabFrame(): string | null {
    const v = videoRef.current; const c = canvasRef.current;
    if (!v || !c) return null;
    const w = v.videoWidth || 640; const h = v.videoHeight || 480;
    c.width = w; c.height = h;
    const ctx = c.getContext("2d"); if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.85);
  }

  // First capture: save and return to the KDS.
  function handleCapture() {
    const d = grabFrame();
    if (!d) { toast.error("Camera not ready"); return; }
    saveCapture(orderId, itemId, d);
    toast.success("Photo captured");
    router.push("/orders/live");
  }

  // Recapture: delete the old photo for this order+item and save the new one.
  function handleRecapture() {
    const d = grabFrame();
    if (!d) { toast.error("Camera not ready"); return; }
    deleteCapture(orderId, itemId);
    saveCapture(orderId, itemId, d);
    setCaptured(d);
    toast.success("Photo recaptured");
  }

  const submit = useMutation({
    mutationFn: () => apiPost("/api/evaluate", {
      orderItemId: itemId,
      score,
      status: score >= 85 ? "Pass" : score >= 70 ? "Warn" : "Fail",
      weight_g: Math.round(weight),
      temperature_c: Math.round(temp * 10) / 10,
      image: snapshot,
      notes,
      tags: Array.from(tags),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kds"] });
      qc.invalidateQueries({ queryKey: ["evaluations"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      toast.success("Evaluation saved");
      router.push("/orders/live");
    },
    onError: (e: any) => toast.error(`Save failed: ${e?.message ?? "unknown"}`),
  });

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
          <div><span className="text-muted">Weight</span> <span className="num font-semibold">{Math.round(weight)} g</span>{item && <span className="text-muted text-xs"> / target {item.expected_grams} g</span>}</div>
          <div><span className="text-muted">Temperature</span> <span className="num font-semibold">{temp.toFixed(1)} °C</span></div>
          <div className="ml-auto">
            <label className="text-xs text-muted">Camera</label>
            <select value={activeDeviceId} onChange={(e) => setActiveDeviceId(e.target.value)} className="ml-2 rounded-btn border border-line text-sm bg-white px-2 py-1 focus-ring">
              {devices.length === 0 && <option value="">No camera detected</option>}
              {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 4)}`}</option>)}
            </select>
          </div>
        </div>

        <div className={cn("grid grid-cols-1 gap-4 mt-4", captured ? "md:grid-cols-3" : "md:grid-cols-2")}>
          {/* Expected image */}
          <div>
            <div className="text-xs uppercase tracking-wider text-muted mb-1.5">Expected image</div>
            <div className="aspect-video rounded-md bg-canvas border border-line overflow-hidden flex items-center justify-center">
              {expectedImg
                ? <img src={expectedImg} alt="expected" className="w-full h-full object-cover" />
                : <span className="text-muted text-sm">No reference image</span>}
            </div>
          </div>

          {/* Captured image (only when a photo already exists) */}
          {captured && (
            <div>
              <div className="text-xs uppercase tracking-wider text-muted mb-1.5">Captured image</div>
              <div className="aspect-video rounded-md bg-canvas border border-line overflow-hidden flex items-center justify-center">
                <img src={captured} alt="captured" className="w-full h-full object-cover" />
              </div>
            </div>
          )}

          {/* Live camera */}
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

        {/* Capture / Recapture button centered below */}
        <div className="flex justify-center mt-4">
          {captured
            ? <button onClick={handleRecapture} disabled={!!streamErr} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-btn bg-ink text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"><RotateCcw className="h-4 w-4" /> Recapture</button>
            : <button onClick={handleCapture} disabled={!!streamErr} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-btn bg-ink text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"><Camera className="h-4 w-4" /> Capture</button>}
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
