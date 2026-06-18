"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ImageIcon, Plus, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, apiPatch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { TAG_GLOSSARY, type IssueTag } from "@/lib/mock-data";
import { dishStatus, STATUS_META } from "@/lib/dish-status";

type Dish = {
  id: number;
  name: string;
  category: string;
  expected_grams: number;
  reference_image: string | null;
  description: string | null;
  ai_criteria: string | null;
  monitored_tags: string;
  orders: number;
  eval: number;
};

const ALL_TAGS = Object.keys(TAG_GLOSSARY) as IssueTag[];
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
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["dish", id],
    queryFn: () => api<{ dish: Dish }>(`/api/dishes/${id}`),
  });
  const dish = data?.dish;

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [portion, setPortion] = useState(0);
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [tags, setTags] = useState<Set<IssueTag>>(new Set());
  const [zoom, setZoom] = useState(false);
  const [criteria, setCriteria] = useState<string[]>([...DEFAULT_CRITERIA]);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  useEffect(() => {
    if (!dish) return;
    setName(dish.name);
    setCategory(dish.category);
    setPortion(dish.expected_grams);
    setDescription(dish.description ?? "");
    setImage(dish.reference_image);
    setCriteria(parseCriteria(dish.ai_criteria));
    try {
      setTags(new Set(JSON.parse(dish.monitored_tags) as IssueTag[]));
    } catch {
      setTags(new Set());
    }
  }, [dish?.id]);

  const liveStatus = dishStatus({ reference_image: image, description });
  const sm = STATUS_META[liveStatus];

  const save = useMutation({
    mutationFn: () =>
      apiPatch(`/api/dishes/${id}`, {
        name,
        category,
        expected_grams: portion,
        description: description.trim() || null,
        reference_image: image,
        ai_criteria: criteria.map((c) => c.trim()).filter(Boolean),
        monitored_tags: Array.from(tags),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dishes-list"] });
      qc.invalidateQueries({ queryKey: ["dish", id] });
      toast.success("Item configuration saved");
      router.push("/dish-config");
    },
    onError: () => toast.error("Save failed"),
  });

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      toast.error("Image too large (max 1.5 MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  if (isLoading || !dish) {
    return <div className="rounded-card bg-white shadow-card p-8 text-center text-muted text-sm">Loading...</div>;
  }

  const fieldCls = "mt-1 block w-full rounded-btn border border-line text-sm bg-white px-2 py-1.5 focus-ring";

  return (
    <>
      <Link href="/dish-config" className="inline-flex items-center gap-2 text-xs text-muted hover:text-ink mb-3">
        <ArrowLeft className="h-4 w-4" /> Back to Configuration
      </Link>

      <section className="rounded-card bg-white shadow-card p-5">
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <div className="text-lg font-semibold tracking-tight">{name || dish.name}</div>
            <div className="text-xs text-muted mt-1">
              {category} &middot; {dish.orders} orders, {dish.eval} evaluations
            </div>
          </div>
          <span
            className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap"
            style={{ background: sm.bg, color: sm.fg }}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: sm.dot }} />
            {sm.label === "Partially" ? "Partially configured" : sm.label}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-5 mt-5">
          <div>
            <div className="text-xs font-medium text-muted mb-2">Expected image</div>
            <div className="relative w-full aspect-square rounded-md border border-line bg-canvas overflow-hidden flex items-center justify-center text-muted">
              {isImageUrl(image) ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image}
                    alt=""
                    onClick={() => setZoom(true)}
                    className="h-full w-full object-cover cursor-zoom-in"
                  />
                  <button
                    onClick={() => setImage(null)}
                    className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-white/90 border border-line flex items-center justify-center hover:bg-white"
                    aria-label="Remove image"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <ImageIcon className="h-7 w-7" />
                  <span className="text-[11px]">No image</span>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              className="mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-btn border border-line bg-white text-xs font-medium hover:bg-canvas"
            >
              <Upload className="h-3.5 w-3.5" /> Upload image
            </button>
            <input
              value={image && !image.startsWith("data:") ? image : ""}
              onChange={(e) => setImage(e.target.value || null)}
              placeholder="...or paste image URL"
              className={cn(fieldCls, "mt-2")}
            />
          </div>

          <div className="space-y-4">
            <label className="block text-xs font-medium text-muted">
              Item description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Describe the acceptable plating for this item..."
                className={cn(fieldCls, "resize-y")}
              />
            </label>

            <fieldset className="border border-line rounded-md p-3">
              <legend className="px-1 text-xs font-medium text-muted">AI Food Criteria</legend>
              <p className="text-[11px] text-muted mb-2">
                Each line is a check the AI runs on the photo captured in KDS to score this item.
              </p>
              <div className="space-y-2">
                {criteria.map((c, i) => (
                  <div key={i} className="relative">
                    <textarea
                      value={c}
                      onChange={(e) =>
                        setCriteria((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                      }
                      rows={2}
                      placeholder={`Criteria ${i + 1} — e.g. garnish present and correctly placed`}
                      className={cn(fieldCls, "resize-y pr-9")}
                    />
                    {criteria.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setCriteria((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute top-2.5 right-2 h-6 w-6 rounded-full text-muted hover:bg-canvas hover:text-danger-600 flex items-center justify-center"
                        aria-label="Remove criteria"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setCriteria((prev) => [...prev, ""])}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-btn border border-line bg-white text-xs font-medium hover:bg-canvas"
                >
                  <Plus className="h-3.5 w-3.5" /> Add criteria
                </button>
              </div>
            </fieldset>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-muted">
                Expected portion (g)
                <input type="number" value={portion} onChange={(e) => setPortion(Number(e.target.value))} className={fieldCls} />
              </label>
              <label className="block text-xs font-medium text-muted">
                Category
                <input value={category} onChange={(e) => setCategory(e.target.value)} className={fieldCls} />
              </label>
            </div>

            <fieldset className="border border-line rounded-md p-3">
              <legend className="px-1 text-xs font-medium text-muted">Tags monitored</legend>
              <div className="flex flex-wrap gap-2 mt-1">
                {ALL_TAGS.map((t) => (
                  <label key={t} className="inline-flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={tags.has(t)}
                      onChange={() => {
                        const next = new Set(tags);
                        next.has(t) ? next.delete(t) : next.add(t);
                        setTags(next);
                      }}
                      className="rounded text-brand-600 focus-ring"
                    />
                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700">{t}</span>
                    <span className="text-muted">{TAG_GLOSSARY[t]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-5 border-t border-line pt-4">
          <Link href="/dish-config" className="px-3 py-2 rounded-btn border border-line bg-white text-xs font-medium hover:bg-canvas">
            Cancel
          </Link>
          <button
            disabled={save.isPending}
            onClick={() => save.mutate()}
            className="px-3 py-2 rounded-btn bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 disabled:opacity-50"
          >
            {save.isPending ? "Saving..." : "Save changes"}
          </button>
        </div>
      </section>

      {zoom && isImageUrl(image) && (
        <div
          onClick={() => setZoom(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 cursor-zoom-out"
        >
          <button
            onClick={() => setZoom(false)}
            className="absolute top-4 right-4 h-9 w-9 rounded-full bg-white/90 flex items-center justify-center hover:bg-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt=""
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-md shadow-2xl cursor-default"
          />
        </div>
      )}
    </>
  );
}
