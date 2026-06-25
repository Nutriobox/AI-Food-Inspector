"use client";

import Link from "next/link";
import { Camera, Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { hasCapture, getCapture, CAPTURES_CHANGED_EVENT } from "@/lib/captures";
import { cn } from "@/lib/utils";

type LiveItem = {
  id: number; dish_id: number; dish: string; category: string;
  quantity: number; reference_image: string | null; evaluated: boolean; isAddon: boolean;
};
type LiveOrder = {
  id: number; code: string; restaurant: string; table: string;
  customer: string; channel: string; placed_at: string; minutes: number; status: string; items: LiveItem[];
};

type Tab = "live" | "past";

const CHANNEL_STYLES: Record<string, string> = {
  Swiggy: "text-orange-700 bg-orange-100",
  Zomato: "text-rose-700 bg-rose-100",
  POS: "text-slate-700 bg-slate-200",
};

function orderNumber(code: string) {
  return code.replace(/^ORD-/, "").replace(/^0+/, "") || code;
}

// --- Sample orders matching the reference screenshot (for testing until the
//     Petpooja live feed / reseed is wired up). Times are relative to "now"
//     so the elapsed timers tick like a real KDS. ---
type SampleItem = { dish: string; isAddon?: boolean; qty?: number };
type SampleOrder = { num: string; customer: string; channel: string; elapsed: number; items: SampleItem[] };

const SAMPLE: SampleOrder[] = [
  { num: "29202", customer: "Divyansh", channel: "Swiggy", elapsed: 18 * 60 + 19, items: [
    { dish: "Classic Paneer Tikka Pizza" }, { dish: "Hazelnut & Coffee Milk Smoothie", isAddon: true } ] },
  { num: "29201", customer: "Shalu", channel: "Swiggy", elapsed: 18 * 60 + 35, items: [
    { dish: "Spinach & Corn Kebab (6 Pcs)" } ] },
  { num: "29200", customer: "Shweta", channel: "Zomato", elapsed: 34 * 60 + 55, items: [
    { dish: "Quinoa Buddha Bowl" }, { dish: "Cottage Cheese", isAddon: true } ] },
  { num: "29199", customer: "Saniya", channel: "Swiggy", elapsed: 38 * 60 + 2, items: [
    { dish: "Spaghetti Aglio E Olio" }, { dish: "Classic Masala Lemonade (300 Ml)" },
    { dish: "Quinoa Patty" }, { dish: "Hummus Falafel Pita" }, { dish: "Hummus", isAddon: true } ] },
  { num: "29198", customer: "Parth", channel: "Zomato", elapsed: 40 * 60 + 41, items: [
    { dish: "Make Your Own Protein Shake (300 Ml)" }, { dish: "Dry Fruits", isAddon: true }, { dish: "Fresh Fruits", isAddon: true } ] },
  { num: "29197", customer: "Saurabh", channel: "Zomato", elapsed: 58 * 60 + 26, items: [
    { dish: "Multigrain Overnight Porridge [Dry Fruit Crunch]" } ] },
  { num: "29196", customer: "Cheshna", channel: "POS", elapsed: 75 * 60 + 33, items: [
    { dish: "Veg Whole Wheat Momos (Tandoori Sauce)" }, { dish: "Unfried Chilli Paneer" },
    { dish: "That Brown Girl (300 Ml)" }, { dish: "Chia Coconut Blueberry Pudding" } ] },
  { num: "29195", customer: "Sanoj", channel: "Swiggy", elapsed: 144 * 60 + 10, items: [
    { dish: "Chia Coconut Blueberry Pudding" } ] },
  { num: "29194", customer: "Rohan", channel: "Swiggy", elapsed: 146 * 60 + 53, items: [
    { dish: "Fried Chicken Rice Bowl" }, { dish: "Watermelon Chia Cold Pressed Juice", isAddon: true } ] },
  { num: "29193", customer: "Aditi", channel: "Zomato", elapsed: 152 * 60 + 8, items: [
    { dish: "Classic Grilled Chicken Salad" }, { dish: "Charcoal Lemonade (300 Ml)" }, { dish: "Extra Chicken Breast ( 80 Gm )", isAddon: true } ] },
  { num: "29192", customer: "Karan", channel: "Swiggy", elapsed: 158 * 60 + 40, items: [
    { dish: "Loaded Chicken Extravaganza Pizza" }, { dish: "Frothy Cappuccino" } ] },
  { num: "29191", customer: "Megha", channel: "POS", elapsed: 165 * 60 + 12, items: [
    { dish: "Beirut Falafel Hummus Salad" }, { dish: "Hummus", isAddon: true } ] },
  { num: "29190", customer: "Vikram", channel: "Zomato", elapsed: 171 * 60 + 35, items: [
    { dish: "Butter(Less) Chicken Combo" } ] },
  { num: "29189", customer: "Ananya", channel: "Swiggy", elapsed: 178 * 60 + 5, items: [
    { dish: "Quinoa Buddha Bowl" }, { dish: "Blueberry Chia (300 Ml)" }, { dish: "Eggless Walnut Brownie" } ] },
  { num: "29188", customer: "Rahul", channel: "Zomato", elapsed: 185 * 60 + 50, items: [
    { dish: "Tandoori Chicken Tikka Sandwich" }, { dish: "Extra Dip", isAddon: true } ] },
];

function buildSampleOrders(): LiveOrder[] {
  const base = Date.now();
  let itemId = 90000;
  return SAMPLE.map((o, oi) => ({
    id: 80000 + oi,
    code: o.num,
    restaurant: "NutrioBox (DLF Phase 2)",
    table: "",
    customer: o.customer,
    channel: o.channel,
    placed_at: new Date(base - o.elapsed * 1000).toISOString(),
    minutes: Math.floor(o.elapsed / 60),
    status: "pending",
    items: o.items.map((it) => ({
      id: itemId++,
      dish_id: 0,
      dish: it.dish,
      category: it.isAddon ? "Add-Ons" : "Main",
      quantity: it.qty ?? 1,
      reference_image: null,
      evaluated: false,
      isAddon: !!it.isAddon,
    })),
  }));
}

// Live elapsed timer (HH:MM:SS) since the order was placed.
function ElapsedTimer({ placedAt }: { placedAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const secs = Math.max(0, Math.floor((now - new Date(placedAt).getTime()) / 1000));
  const hh = String(Math.floor(secs / 3600)).padStart(2, "0");
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return <span className="num tabular-nums">{hh}:{mm}:{ss}</span>;
}

export default function KdsPage() {
  const [tab, setTab] = useState<Tab>("live");
  // KDS is a live, time-based view — render only on the client to avoid
  // server/client hydration mismatches on timers and order times.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Bump on capture changes / window focus so card photo-status re-reads.
  const [capV, setCapV] = useState(0);
  useEffect(() => {
    const bump = () => setCapV((v) => v + 1);
    window.addEventListener("focus", bump);
    window.addEventListener(CAPTURES_CHANGED_EVENT, bump);
    return () => {
      window.removeEventListener("focus", bump);
      window.removeEventListener(CAPTURES_CHANGED_EVENT, bump);
    };
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["kds", "live"],
    queryFn: () => api<{ orders: LiveOrder[] }>(`/api/kds?mode=live`),
    refetchInterval: 5000,
    retry: false,
  });
  // Stable sample data (timers tick off these placed_at values).
  const sample = useMemo(() => buildSampleOrders(), []);
  const liveData = data?.orders ?? [];
  // Until the live feed / reseed is wired, fall back to the sample orders.
  const base = liveData.length === 0 ? sample : liveData;

  // An order is "complete" once every item has a captured photo.
  const isComplete = (o: LiveOrder) => o.items.length > 0 && o.items.every((it) => hasCapture(o.id, it.id));
  // Completion time = the latest photo captured for the order.
  const completionTime = (o: LiveOrder) =>
    Math.max(0, ...o.items.map((it) => {
      const c = getCapture(o.id, it.id);
      return c ? new Date(c.capturedAt).getTime() : 0;
    }));

  // Live = not-yet-complete orders; Past = complete orders, most recently completed first.
  const liveOrders = base.filter((o) => !isComplete(o));
  const pastOrders = base.filter(isComplete).sort((a, b) => completionTime(b) - completionTime(a));
  const orders = tab === "live" ? liveOrders : pastOrders;
  // reference capV so live/past partition recomputes when captures change
  void capV;

  // Item summary: aggregate quantities but keep the SAME sequence as the cards
  // (orders are most-recent-first; items in card order, by first appearance).
  const itemSummary = useMemo(() => {
    const map = new Map<string, number>();
    const seq: string[] = [];
    for (const o of orders) {
      for (const it of o.items) {
        if (!map.has(it.dish)) seq.push(it.dish);
        map.set(it.dish, (map.get(it.dish) ?? 0) + it.quantity);
      }
    }
    return seq.map((name) => [name, map.get(name)!] as [string, number]);
  }, [orders]);

  if (!mounted) {
    return <div className="rounded-card bg-white shadow-card p-8 text-center text-muted text-sm">Loading orders…</div>;
  }

  return (
    <div className="w-screen mx-[calc(50%-50vw)] px-4 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4 lg:h-[calc(100vh-7rem)] select-none [-webkit-user-select:none] [-webkit-touch-callout:none] [touch-action:pan-y]">
      {/* Sidebar: Live/Past tabs + Item Summary */}
      <aside className="rounded-card bg-white shadow-card p-3 flex flex-col lg:h-full overflow-hidden">
        <div className="flex gap-1.5">
          {(["live", "past"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 text-center text-sm font-semibold px-2 py-2 rounded-btn transition-colors whitespace-nowrap",
                tab === t ? "bg-amber-400 text-amber-950 shadow-pill" : "text-muted hover:bg-canvas"
              )}
            >
              {t === "live" ? "Live Orders" : "Past Orders"}
            </button>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-line flex flex-col flex-1 min-h-0">
          <div className="px-1 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Item Summary</div>
          <ul className="space-y-0.5 flex-1 overflow-y-auto pr-1 [touch-action:pan-y] [-webkit-overflow-scrolling:touch] overscroll-contain">
            {itemSummary.map(([name, qty]) => (
              <li key={name} className="flex items-center justify-between gap-2 text-[13px] px-1 py-1 rounded-md hover:bg-canvas">
                <span className="truncate text-ink">{name}</span>
                <span className="num shrink-0 font-semibold text-muted">{qty}</span>
              </li>
            ))}
            {itemSummary.length === 0 && (
              <li className="text-xs text-muted px-1 py-2">No items.</li>
            )}
          </ul>
        </div>
      </aside>

      {/* Main: order cards */}
      <section className="lg:h-full overflow-y-auto [touch-action:pan-y] [-webkit-overflow-scrolling:touch] overscroll-contain">
        {isLoading && orders.length === 0 ? (
          <div className="rounded-card bg-white shadow-card p-8 text-center text-muted text-sm">Loading orders…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start content-start">
            {orders.map((o) => <OrderCard key={o.id} order={o} past={tab === "past"} v={capV} />)}
            {orders.length === 0 && (
              <div className="col-span-full rounded-card bg-white shadow-card p-8 text-center text-muted text-sm">
                {tab === "live" ? "No live orders right now." : "No past orders found."}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function OrderCard({ order, past, v }: { order: LiveOrder; past: boolean; v: number }) {
  void v; // re-render trigger when captures change
  const mains = order.items.filter((i) => !i.isAddon);
  const addons = order.items.filter((i) => i.isAddon);
  const channelCls = CHANNEL_STYLES[order.channel] ?? CHANNEL_STYLES.POS;
  const placedTime = new Date(order.placed_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

  return (
    <article className="rounded-card bg-white shadow-card overflow-hidden border border-line flex flex-col h-[240px]">
      {/* Yellow header */}
      <header className="bg-amber-400 text-amber-950 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-bold text-sm num">{orderNumber(order.code)}</span>
          <span className="text-[12px] text-amber-900/80 truncate">{order.customer}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] num">{mains.length} {mains.length === 1 ? "item" : "items"}</span>
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-md", channelCls)}>{order.channel}</span>
        </div>
      </header>

      {/* Timer + placed time */}
      <div className="px-3 pt-2 pb-1 text-[11px] text-muted flex items-center justify-between shrink-0">
        <span className="num">{past ? "—" : <ElapsedTimer placedAt={order.placed_at} />}</span>
        <span className="num">{placedTime}</span>
      </div>

      {/* Items */}
      <ul className="divide-y divide-line flex-1 min-h-0 overflow-y-auto [touch-action:pan-y] [-webkit-overflow-scrolling:touch] overscroll-contain">
        {mains.map((it) => {
          const captured = hasCapture(order.id, it.id);
          return (
          <li key={it.id} className="px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={cn("text-sm font-medium truncate", captured ? "text-brand-600" : "text-danger-500")}>
                  {it.dish}{it.quantity > 1 && <span className="ml-1.5 text-[11px] text-muted">x {it.quantity}</span>}
                </span>
              </div>
              <Link
                href={`/orders/live/${order.id}/${it.id}/evaluate?dish=${encodeURIComponent(it.dish)}`}
                aria-label={captured ? `View photo of ${it.dish}` : `Capture ${it.dish}`}
                title={captured ? "View / recapture photo" : "Capture photo"}
                className={cn(
                  "shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-lg border-2 active:scale-95 transition-transform hover:bg-canvas",
                  captured ? "border-brand-600 text-brand-600" : "border-line text-muted hover:text-ink"
                )}
              >
                {captured ? <Info className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
              </Link>
            </div>
          </li>
          );
        })}
        {addons.map((it) => {
          const captured = hasCapture(order.id, it.id);
          return (
          <li key={it.id} className="px-3 py-1.5 bg-canvas/50">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] truncate flex items-center gap-1.5 min-w-0">
                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Add on</span>
                <span className={cn("truncate", captured ? "text-brand-600" : "text-danger-500")}>{it.dish}{it.quantity > 1 && <span className="ml-1 text-[11px]">x {it.quantity}</span>}</span>
              </span>
              <Link
                href={`/orders/live/${order.id}/${it.id}/evaluate?dish=${encodeURIComponent(it.dish)}`}
                aria-label={captured ? `View photo of ${it.dish}` : `Capture ${it.dish}`}
                title={captured ? "View / recapture photo" : "Capture photo"}
                className={cn(
                  "shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-lg border-2 active:scale-95 transition-transform hover:bg-white",
                  captured ? "border-brand-600 text-brand-60