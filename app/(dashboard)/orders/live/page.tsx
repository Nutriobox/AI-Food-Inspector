"use client";

import Link from "next/link";
import { Camera, Info } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cacheOrders, getCachedOrders } from "@/lib/offline-queue";
import { hasCapture, getCapture, CAPTURES_CHANGED_EVENT } from "@/lib/captures";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type LiveItem = {
  id: number; dish_id: number; dish: string; category: string;
  quantity: number; reference_image: string | null; evaluated: boolean; isAddon: boolean; noCapture: boolean;
};
type LiveOrder = {
  id: number; code: string; restaurant: string; table: string;
  customer: string; channel: string; placed_at: string; minutes: number; status: string;
  kot: string | null; ext_id: string | null; notes: string | null; order_type: string | null;
  items: LiveItem[];
};

type Tab = "live" | "past";

const CHANNEL_STYLES: Record<string, string> = {
  Swiggy: "text-orange-700 bg-orange-100",
  Zomato: "text-rose-700 bg-rose-100",
  POS: "text-slate-700 bg-slate-200",
};

// POS orders show their order type (Dine In / Pick Up) instead of "POS".
const TYPE_STYLES: Record<string, string> = {
  "Dine In": "text-emerald-700 bg-emerald-100",
  "Pick Up": "text-violet-700 bg-violet-100",
  "Pickup": "text-violet-700 bg-violet-100",
  "Delivery": "text-slate-700 bg-slate-200",
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
    kot: null, ext_id: null, notes: null, order_type: null,
    items: o.items.map((it) => ({
      id: itemId++,
      dish_id: 0,
      dish: it.dish,
      category: it.isAddon ? "Add-Ons" : "Main",
      quantity: it.qty ?? 1,
      reference_image: null,
      evaluated: false,
      isAddon: !!it.isAddon,
      noCapture: false,
    })),
  }));
}

// One shared 1-second clock for ALL timers (instead of one interval per order card).
let _clockNow = Date.now();
const _clockSubs = new Set<() => void>();
let _clockTimer: ReturnType<typeof setInterval> | null = null;
function _subscribeClock(cb: () => void) {
  _clockSubs.add(cb);
  if (!_clockTimer) _clockTimer = setInterval(() => { _clockNow = Date.now(); _clockSubs.forEach((f) => f()); }, 1000);
  return () => {
    _clockSubs.delete(cb);
    if (_clockSubs.size === 0 && _clockTimer) { clearInterval(_clockTimer); _clockTimer = null; }
  };
}
function useSharedNow() {
  return useSyncExternalStore(_subscribeClock, () => _clockNow, () => _clockNow);
}

// Live elapsed timer (HH:MM:SS) since the order was placed.
function ElapsedTimer({ placedAt }: { placedAt: string }) {
  const now = useSharedNow();
  const secs = Math.max(0, Math.floor((now - new Date(placedAt).getTime()) / 1000));
  const hh = String(Math.floor(secs / 3600)).padStart(2, "0");
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return <span className="num tabular-nums">{hh}:{mm}:{ss}</span>;
}

export default function KdsPage() {
  const [tab, setTab] = useState<Tab>("live");
  const [outlet, setOutlet] = useState("All Restaurants");
  const [isAdmin, setIsAdmin] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // KDS is a live, time-based view — render only on the client to avoid
  // server/client hydration mismatches on timers and order times.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Re-check the 15-minute Live->Past rule periodically (even when no new orders arrive).
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((t) => t + 1), 15000); return () => clearInterval(id); }, []);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setIsAdmin(((data.user?.user_metadata as any)?.role) !== "outlet"));
  }, []);

  // Finger/mouse drag-to-scroll over the order cards (reliable on the kiosk touchscreen).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let down = false, startY = 0, startTop = 0;
    const onDown = (e: PointerEvent) => { down = true; startY = e.clientY; startTop = el.scrollTop; };
    const onMove = (e: PointerEvent) => { if (down) el.scrollTop = startTop - (e.clientY - startY); };
    const onUp = () => { down = false; };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [mounted]);

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

  const { data: restData } = useQuery({
    queryKey: ["restaurants", "list"],
    queryFn: () => api<{ rows: any[] }>("/api/restaurants?mode=list"),
    enabled: isAdmin,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["kds", "live", outlet],
    queryFn: async () => {
      const url = `/api/kds?mode=live${outlet !== "All Restaurants" ? `&restaurant=${encodeURIComponent(outlet)}` : ""}`;
      try {
        const res = await api<{ orders: LiveOrder[] }>(url);
        cacheOrders(outlet, res.orders); // remember the last-known queue for offline
        return res;
      } catch (e) {
        const cached = await getCachedOrders(outlet);
        if (cached) return { orders: cached as LiveOrder[] };
        throw e;
      }
    },
    refetchInterval: 4000,
    refetchIntervalInBackground: true, // keep polling even if the kiosk tab is backgrounded
    retry: false,
  });

  // Kiosk safety net: full page reload every 30 min so the screen never freezes / goes stale.
  // (Only runs while on the live KDS view, so it never interrupts a capture.)
  useEffect(() => {
    const id = setInterval(() => window.location.reload(), 30 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  // Stable sample data (timers tick off these placed_at values).
  const sample = useMemo(() => buildSampleOrders(), []);
  const liveData = data?.orders ?? [];
  // Until the live feed / reseed is wired, fall back to the sample orders.
  const base = liveData; // show only real (outlet-filtered) orders, no demo fallback

  // An order is "complete" once every item has a captured photo.
  const isComplete = (o: LiveOrder) => {
    // After 15 minutes an order auto-moves to Past (photo taken or not);
    // it also moves once every item is evaluated/captured.
    const ageMin = (Date.now() - new Date(o.placed_at).getTime()) / 60000;
    if (ageMin >= 15) return true;
    // Free add-ons (noCapture) have no photo step -> they don't block completion.
    const evaluatable = o.items.filter((it) => !it.noCapture);
    return evaluatable.length > 0 && evaluatable.every((it) => it.evaluated || hasCapture(o.id, it.id));
  };
  // Completion time = the latest photo captured for the order.
  const completionTime = (o: LiveOrder) =>
    Math.max(0, ...o.items.map((it) => {
      const c = getCapture(o.id, it.id);
      return c ? new Date(c.capturedAt).getTime() : 0;
    }));

  // Live = not-yet-complete orders; Past = complete orders, most recently completed first.
  const liveOrders = base.filter((o) => !isComplete(o));
  const pastOrders = base.filter(isComplete).sort((a, b) => (a.placed_at < b.placed_at ? 1 : -1));
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
    <div className="w-screen mx-[calc(50%-50vw)] px-4 grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4 lg:h-[calc(100vh-7rem)] select-none [-webkit-user-select:none] [-webkit-touch-callout:none] [touch-action:none]">
      {/* Sidebar: Live/Past tabs + Item Summary */}
      <aside className="rounded-card bg-white shadow-card p-3 flex flex-col lg:h-full overflow-hidden">
        {isAdmin && (
          <select value={outlet} onChange={(e) => setOutlet(e.target.value)}
            className="mb-2 w-full rounded-btn border border-line text-sm bg-white px-2 py-1.5 focus-ring">
            <option value="All Restaurants">All outlets</option>
            {(restData?.rows ?? []).map((r: any) => (<option key={r.id} value={r.name}>{r.name}</option>))}
          </select>
        )}
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
          <ul className="space-y-0.5 flex-1 overflow-y-auto pr-1 [touch-action:none] [-webkit-overflow-scrolling:touch] overscroll-contain">
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
      <section ref={scrollRef} className="lg:h-full overflow-y-auto [touch-action:none] [-webkit-overflow-scrolling:touch] overscroll-contain cursor-grab active:cursor-grabbing">
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

const OrderCard = memo(function OrderCard({ order, past, v }: { order: LiveOrder; past: boolean; v: number }) {
  void v; // re-render trigger when captures change
  const mains = order.items.filter((i) => !i.isAddon);
  const addons = order.items.filter((i) => i.isAddon);
  const badgeLabel = order.channel === "POS" ? (order.order_type || "Dine In") : order.channel;
  const badgeCls = order.channel === "POS"
    ? (TYPE_STYLES[order.order_type ?? ""] ?? CHANNEL_STYLES.POS)
    : (CHANNEL_STYLES[order.channel] ?? CHANNEL_STYLES.POS);
  const note = (order.notes ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "").replace(/[ \t]+/g, " ").trim();
  const placedTime = new Date(order.placed_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

  return (
    <article className="rounded-card bg-white shadow-card overflow-hidden border border-line flex flex-col h-[240px]">
      {/* Yellow header */}
      <header className="bg-amber-400 text-amber-950 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-bold text-sm num">{order.kot ? `KOT ${order.kot}` : orderNumber(order.code)}</span>
          <span className="text-[12px] text-amber-900/80 truncate">{order.customer}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] num">{mains.length} {mains.length === 1 ? "item" : "items"}</span>
          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-md", badgeCls)}>{badgeLabel}</span>
        </div>
      </header>

      {order.ext_id && (order.channel === "Swiggy" || order.channel === "Zomato") && (
        <div className="px-3 pt-1.5 text-[11px] text-muted truncate shrink-0">
          {order.channel} <span className="num">{order.ext_id.slice(0, -4)}<span className="font-bold text-ink">{order.ext_id.slice(-4)}</span></span>
        </div>
      )}

      {/* Timer + placed time */}
      <div className="px-3 pt-2 pb-1 text-[11px] text-muted flex items-center justify-between shrink-0">
        <span className="num">{past ? "—" : <ElapsedTimer placedAt={order.placed_at} />}</span>
        <span className="num">{placedTime}</span>
      </div>

      {/* Items */}
      <ul className="divide-y divide-line flex-1 min-h-0 overflow-y-auto [touch-action:none] [-webkit-overflow-scrolling:touch] overscroll-contain">
        {mains.map((it) => {
          const captured = it.evaluated || hasCapture(order.id, it.id);
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
          const captured = it.evaluated || hasCapture(order.id, it.id);
          return (
          <li key={it.id} className="px-3 py-1.5 bg-canvas/50">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] truncate flex items-center gap-1.5 min-w-0">
                <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Add on</span>
                <span className={cn("truncate", it.noCapture ? "text-ink" : captured ? "text-brand-600" : "text-danger-500")}>{it.dish}{it.quantity > 1 && <span className="ml-1 text-[11px]">x {it.quantity}</span>}</span>
              </span>
              {!it.noCapture && (
                <Link
                  href={`/orders/live/${order.id}/${it.id}/evaluate?dish=${encodeURIComponent(it.dish)}`}
                  aria-label={captured ? `View photo of ${it.dish}` : `Capture ${it.dish}`}
                  title={captured ? "View / recapture photo" : "Capture photo"}
                  className={cn(
                    "shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-lg border-2 active:scale-95 transition-transform hover:bg-white",
                    captured ? "border-brand-600 text-brand-600" : "border-line text-muted hover:text-ink"
                  )}
                >
                  {captured ? <Info className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
                </Link>
              )}
            </div>
          </li>
          );
        })}
        {order.items.length === 0 && <li className="px-3 py-3 text-xs text-muted">No items.</li>}
      </ul>

      {note && (
        <div className="px-3 py-1.5 border-t border-line bg-amber-50 text-[11px] text-amber-900 shrink-0 whitespace-pre-line line-clamp-2">
          <span className="font-semibold">Note:</span> {note}
        </div>
      )}
    </article>
  );
});
