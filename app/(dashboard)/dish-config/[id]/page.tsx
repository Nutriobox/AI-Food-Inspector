"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, ImageIcon, Plus, Scale, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiPatch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { dishStatus, STATUS_META } from "@/lib/dish-status";

type Dish = {
  id: number;
  name: string;
  category: string;
  expected_grams: number;
  reference_image: string | null;
  reference_image_delivery: string | null;
  description: string | null;
  ai_criteria: string | null;
  monitored_tags: string;
  orders: number;
  eval: number;
};

const DEFAULT_CRITERIA = ["", "", "", ""];

function isImageUrl(v: string | null): v is string {
  return !!v && (/^https?:\/\//.test(v) || v.startsWith("data:image"));
}

function parseCriteria(raw: string | null): string[] {
  if (!raw) return [...DEFAULT_CRITERIA];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length > 0) return arr.map((x) => String(x));
  } catch {}
  return [...DEFAULT_CRITERIA];
}

export default function DishDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["dish", id],
    queryFn: () => api<{ dish: Dish }>(`/api/dishes/${id}`),
  });
  const dish = data?.dish;

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [dineImg, setDineImg] = useState<string | null>(null);
  const [delivImg, setDelivImg] = useState<string | null>(null);
  const [grams, setGrams] = useState(0); // saved expected weight (captured from the scale)
  const [criteria, setCriteria] = useState<string[]>([...DEFAULT_CRITERIA]);
  const [zoom, setZoom] = useState<string | null>(null);

  // ---- Machine camera (same mechanism as the KDS capture) ----
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>("");
  const [streamErr, setStreamErr] = useState<string | null>(null);
  const dineFileRef = useRef<HTMLInputElement>(null);
  const delivFileRef = useRef<HTMLInputElement>(null);

  // ---- Live scale weight ----
  const [weight, setWeight] = useState<number>(0);
  const [scaleOk, setScaleOk] = useState(false);

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
        if (!cancelled) setStreamErr(err?.message ?? "Could not access camera.");
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
  }, [activeDeviceId]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_WEIGHT_URL || "http://127.0.0.1:8765/weight";
    let active = true;
    const tick = async () => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          if (active && j?.ok && typeof j.weight_g === "number") { setWeight(j.weight_g); setScaleOk(true); return; }
        }
      } catch {}
      if (active) { setWeight(0); setScaleOk(false); }
    };
    const t = setInterval(tick, 200);
    tick();
    return () => { active = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  useEffect(() => {
    if (!dish) return;
    setName(dish.name);
    setCategory(dish.category);
    setDescription(dish.description ?? "");
    setDineImg(dish.reference_image);
    setDelivImg(dish.reference_image_delivery);
    setGrams(dish.expected_grams || 0);
    setCriteria(parseCriteria(dish.ai_criteria));
  }, [dish?.id]);

  function grabFrame(): string | null {
    const v = videoRef.current; const c = canvasRef.current;
    if (!v || !c) return null;
    const w = v.videoWidth || 640; const h = v.videoHeight || 480;
    c.width = w; c.height = h;
    const ctx = c.getContext("2d"); if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.85);
  }

  function capture(which: "dine" | "deliv") {
    const d = grabFrame();
    if (!d) { toast.error("Camera not ready"); return; }
    which === "dine" ? setDineImg(d) : setDelivImg(d);
    toast.success(`${which === "dine" ? "Dine In" : "Delivery"} image captured`);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>, which: "dine" | "deliv") {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) { toast.error("Image too large (max 1.5 MB)"); return; }
    const reader = new FileReader();
    reader.onload = () => (which === "dine" ? setDineImg(reader.result as string) : setDelivImg(reader.result as string));
    reader.readAsDataURL(file);
  }

  function captureWeight() {
    if (!scaleOk) { toast.error("Scale not connected — open this on the machine"); return; }
    const g = Math.round(weight);
    setGrams(g);
    toast.success(`Expected weight set to ${g} g`);
  }

  const liveStatus = dishStatus({ reference_image: dineImg, description });
  const sm = STATUS_META[liveStatus];

  const save = useMutation({
    mutationFn: () =>
      apiPatch(`/api/dishes/${id}`, {
        name,
        category,
        expected_grams: grams > 0 ? grams : undefined,
        description: description.trim() || null,
        reference_image: dineImg,
        reference_image_delivery: delivImg,
        ai_criteria: criteria.map((c) => c.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dishes-list"] });
      qc.invalidateQueries({ queryKey: ["dish", id] });
      toast.success("Item configuration saved");
      router.push("/dish-config");
    },
    onError: () => toast.error("Save failed"),
  });

  if (isLoading || !dish) {
    return <div className="rounded-card bg-white shadow-card p-8 text-center text-muted text-sm">Loading...</div>;
  }

  const fieldCls = "mt-1 block w-full rounded-btn border border-line text-sm bg-white px-2 py-1.5 focus-ring";

  return (
    <>
      <Link href="/dish-config" className="inline-flex items-center gap-2 text-xs text-muted hover:text-ink mb-3">
        <ArrowLeft className="h-4 w-4" /> Back to Menu Library
      </Link>

      <section className="rounded-card bg-white shadow-card p-5">
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <div className="text-lg font-semibold tracking-tight">{name || dish.name}</div>
            <div className="text-xs text-muted mt-1">{category} &middot; {dish.orders} orders, {dish.eval} evaluations</div>
          </div>
          <span className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap" style={{ background: sm.bg, color: sm.fg }}>
            <span className="h-2 w-2 rounded-full" style={{ background: sm.dot }} />
            {sm.label === "Partially" ? "Partially configured" : sm.label}
          </span>
        </div>

        {/* Machine camera + live scale */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-muted">Machine camera</span>
              <select value={activeDeviceId} onChange={(e) => setActiveDeviceId(e.target.value)} className="rounded-btn border border-line text-[11px] bg-white px-1.5 py-1 focus-ring max-w-[170px]">
                {devices.length === 0 && <option value="">No camera</option>}
                {devices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 4)}`}</option>)}
              </select>
            </div>
            <div className="aspect-video rounded-md bg-black overflow-hidden relative">
              <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
              {streamErr && (
                <div className="absolute inset-0 flex items-center justify-center text-[11px] text-rose-300 px-4 text-center">
                  {streamErr} Open this page on the machine (with its camera) to configure.
                </div>
              )}
            </div>

            {/* live scale */}
            <div className="mt-3 flex items-center gap-3 rounded-md border border-line bg-canvas px-3 py-2">
              <Scale className="h-4 w-4 text-muted shrink-0" />
              <div className="text-sm">
                <span className="text-muted text-xs">Live scale</span>{" "}
                <span className="num font-semibold">{scaleOk ? `${Math.round(weight)} g` : "not connected"}</span>
              </div>
              <button onClick={captureWeight} className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-btn bg-ink text-white text-[11px] font-semibold hover:opacity-90">
                Capture weight
              </button>
            </div>
            <div className="mt-2 text-xs text-muted">
              Expected weight (saved): <span className="num font-semibold text-ink">{grams > 0 ? `${grams} g` : "— place item & capture"}</span>
            </div>
          </div>

          {/* Two reference images */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ImageSlot
              label="Expected image · Dine In"
              value={dineImg}
              onCapture={() => capture("dine")}
              onUpload={() => dineFileRef.current?.click()}
              onClear={() => setDineImg(null)}
              onZoom={() => dineImg && setZoom(dineImg)}
              canCapture={!streamErr}
            />
            <ImageSlot
              label="Expected image · Delivery"
              value={delivImg}
              onCapture={() => capture("deliv")}
              onUpload={() => delivFileRef.current?.click()}
              onClear={() => setDelivImg(null)}
              onZoom={() => delivImg && setZoom(delivImg)}
              canCapture={!streamErr}
            />
            <input ref={dineFileRef} type="file" accept="image/*" onChange={(e) => onFile(e, "dine")} className="hidden" />
            <input ref={delivFileRef} type="file" accept="image/*" onChange={(e) => onFile(e, "deliv")} className="hidden" />
          </div>
        </div>

        {/* Description + Category + AI criteria */}
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-muted">
              Item description
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Describe the acceptable plating for this item..." className={cn(fieldCls, "resize-y")} />
            </label>
            <label className="block text-xs font-medium text-muted">
              Category
              <input value={category} readOnly className={cn(fieldCls, "bg-canvas text-muted cursor-default")} />
            </label>
          </div>

          <fieldset className="border border-line rounded-md p-3">
            <legend className="px-1 text-xs font-medium text-muted">AI Food Criteria</legend>
            <p className="text-[11px] text-muted mb-2">Each line is a check the AI runs on the photo captured in KDS to score this item.</p>
            <div className="space-y-2">
              {criteria.map((c, i) => (
                <div key={i} className="relative">
                  <textarea value={c} onChange={(e) => setCriteria((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))} rows={2} placeholder={`Criteria ${i + 1} — e.g. garnish present and correctly placed`} className={cn(fieldCls, "resize-y pr-9")} />
                  {criteria.length > 1 && (
                    <button type="button" onClick={() => setCriteria((prev) => prev.filter((_, j) => j !== i))} className="absolute top-2.5 right-2 h-6 w-6 rounded-full text-muted hover:bg-canvas hover:text-danger-600 flex items-center justify-center" aria-label="Remove criteria">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-2">
              <button type="button" onClick={() => setCriteria((prev) => [...prev, ""])} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-btn border border-line bg-white text-xs font-medium hover:bg-canvas">
                <Plus className="h-3.5 w-3.5" /> Add criteria
              </button>
            </div>
          </fieldset>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5 border-t border-line pt-4">
          <Link href="/dish-config" className="px-3 py-2 rounded-btn border border-line bg-white text-xs font-medium hover:bg-canvas">Cancel</Link>
          <button disabled={save.isPending} onClick={() => save.mutate()} className="px-3 py-2 rounded-btn bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 disabled:opacity-50">
            {save.isPending ? "Saving..." : "Save configuration"}
          </button>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </section>

      {zoom && (
        <div onClick={() => setZoom(null)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 cursor-zoom-out">
          <button onClick={() => setZoom(null)} className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/90 flex items-center justify-center hover:bg-white" aria-label="Close"><X className="h-5 w-5" /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="" onClick={(e) => e.stopPropagation()} className="max-h-[90vh] max-w-[90vw] object-contain rounded-md shadow-2xl cursor-default" />
        </div>
      )}
    </>
  );
}

function ImageSlot({
  label, value, onCapture, onUpload, onClear, onZoom, canCapture,
}: {
  label: string; value: string | null;
  onCapture: () => void; onUpload: () => void; onClear: () => void; onZoom: () => void; canCapture: boolean;
}) {
  const has = isImageUrl(value);
  return (
    <div>
      <div className="text-xs font-medium text-muted mb-1.5">{label}</div>
      <div className="relative w-full aspect-square rounded-md border border-line bg-canvas overflow-hidden flex items-center justify-center text-muted">
        {has ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value as string} alt="" onClick={onZoom} className="h-full w-full object-cover cursor-zoom-in" />
            <button onClick={onClear} className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-white/90 border border-line flex items-center justify-center hover:bg-white" aria-label="Remove image">
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1.5"><ImageIcon className="h-7 w-7" /><span className="text-[11px]">No image</span></div>
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button onClick={onCapture} disabled={!canCapture} className="inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-btn bg-ink text-white text-[11px] font-semibold hover:opacity-90 disabled:opacity-50">
          <Camera className="h-3.5 w-3.5" /> Capture
        </button>
        <button onClick={onUpload} className="inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-btn border border-line bg-white text-[11px] font-medium hover:bg-canvas">
          <Upload className="h-3.5 w-3.5" /> Upload
        </button>
      </div>
    </div>
  );
}
