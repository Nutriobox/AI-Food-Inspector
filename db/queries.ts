import { q, one, run } from "./client";

export type Filters = {
  restaurant?: string;
  startDate?: string;
  endDate?: string;
  evaluationStatus?: string;
  scoreStatus?: string;
};

function buildOrderWhere(f: Filters) {
  const where: string[] = ["1=1"];
  const params: any[] = [];
  if (f.restaurant && f.restaurant !== "All Restaurants") {
    where.push("r.name = ?");
    params.push(f.restaurant);
  }
  if (f.startDate) {
    where.push("o.placed_at >= ?");
    params.push(f.startDate);
  }
  if (f.endDate) {
    where.push("o.placed_at <= ?");
    params.push(f.endDate + "T23:59:59");
  }
  return { where: where.join(" AND "), params };
}

export async function getKpis(f: Filters) {
  const { where, params } = buildOrderWhere(f);
  const totalOrders = await one<{ c: number }>(
    `SELECT COUNT(*)::int as c FROM orders o JOIN restaurants r ON r.id = o.restaurant_id WHERE ${where}`,
    params
  );
  const evaluatedItems = await one<{ c: number }>(
    `SELECT COUNT(DISTINCT oi.order_id)::int as c
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN restaurants r ON r.id = o.restaurant_id
     WHERE ${where} AND EXISTS (SELECT 1 FROM evaluations e WHERE e.order_item_id = oi.id)`,
    params
  );
  const total = totalOrders?.c ?? 0;
  const evaluated = evaluatedItems?.c ?? 0;
  const missing = total - evaluated;
  const rate = total === 0 ? 0 : Math.round((evaluated / total) * 100);
  return { total, evaluated, missing, rate };
}

export async function getDailySeries(f: Filters, kind: "orders" | "evals" | "errors") {
  const { where, params } = buildOrderWhere(f);
  if (kind === "orders") {
    return q<{ day: string; y: number }>(
      `SELECT substr(o.placed_at, 1, 10) AS day, COUNT(*)::int AS y
       FROM orders o JOIN restaurants r ON r.id = o.restaurant_id
       WHERE ${where}
       GROUP BY day ORDER BY day`,
      params
    );
  }
  if (kind === "evals") {
    return q<{ day: string; y: number }>(
      `SELECT substr(e.created_at, 1, 10) AS day, COUNT(*)::int AS y
       FROM evaluations e
       JOIN order_items oi ON oi.id = e.order_item_id
       JOIN orders o ON o.id = oi.order_id
       JOIN restaurants r ON r.id = o.restaurant_id
       WHERE ${where}
       GROUP BY day ORDER BY day`,
      params
    );
  }
  return q<{ day: string; y: number }>(
    `SELECT substr(e.created_at, 1, 10) AS day, COUNT(*)::int AS y
     FROM evaluation_tags et
     JOIN evaluations e ON e.id = et.evaluation_id
     JOIN order_items oi ON oi.id = e.order_item_id
     JOIN orders o ON o.id = oi.order_id
     JOIN restaurants r ON r.id = o.restaurant_id
     WHERE ${where}
     GROUP BY day ORDER BY day`,
    params
  );
}

export async function getRecentOrders(f: Filters, limit = 50) {
  const { where, params } = buildOrderWhere(f);
  const rows = await q<any>(
    `SELECT o.id, o.code, o.placed_at, o.status,
            r.name AS restaurant,
            string_agg(d.name, ', ') AS dishes,
            EXISTS(SELECT 1 FROM evaluations e
                   JOIN order_items oi2 ON oi2.id = e.order_item_id
                   WHERE oi2.order_id = o.id) AS evaluated,
            (SELECT m.name FROM evaluations e
               JOIN order_items oi3 ON oi3.id = e.order_item_id
               JOIN managers m ON m.id = e.manager_id
               WHERE oi3.order_id = o.id LIMIT 1) AS manager,
            (SELECT e.status FROM evaluations e
               JOIN order_items oi4 ON oi4.id = e.order_item_id
               WHERE oi4.order_id = o.id ORDER BY e.created_at DESC LIMIT 1) AS score
     FROM orders o
     JOIN restaurants r ON r.id = o.restaurant_id
     JOIN order_items oi ON oi.order_id = o.id
     JOIN dishes d ON d.id = oi.dish_id
     WHERE ${where}
     GROUP BY o.id, r.name
     ORDER BY o.placed_at DESC
     LIMIT ?`,
    [...params, limit]
  );
  return rows.map((r) => ({
    id: r.code,
    time: new Date(r.placed_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }),
    restaurant: r.restaurant,
    dish: r.dishes ?? "—",
    score: (r.score ?? "—") as "Pass" | "Warn" | "Fail" | "—",
    status: r.evaluated ? "Evaluated" : "Not Evaluated",
    manager: r.manager ?? "—",
  }));
}

export async function getEvaluations(f: Filters, limit = 50) {
  const { where, params } = buildOrderWhere(f);
  const rows = await q<any>(
    `SELECT e.id AS eid, e.score, e.created_at, e.status AS evstatus,
            d.name AS dish,
            m.name AS manager,
            o.code AS order_code,
            (SELECT string_agg(et.tag_code, ',') FROM evaluation_tags et WHERE et.evaluation_id = e.id) AS tags
     FROM evaluations e
     JOIN order_items oi ON oi.id = e.order_item_id
     JOIN orders o ON o.id = oi.order_id
     JOIN restaurants r ON r.id = o.restaurant_id
     JOIN dishes d ON d.id = oi.dish_id
     LEFT JOIN managers m ON m.id = e.manager_id
     WHERE ${where}
     ORDER BY e.created_at DESC
     LIMIT ?`,
    [...params, limit]
  );
  return rows.map((r) => ({
    id: `EVL-${String(r.eid).padStart(5, "0")}`,
    time: new Date(r.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }),
    dish: r.dish,
    score: r.score as number,
    tags: r.tags ? (r.tags as string).split(",") : [],
    manager: r.manager ?? "—",
  }));
}

export async function getIssueAggregate(f: Filters) {
  const { where, params } = buildOrderWhere(f);
  return q<{ code: string; name: string; count: number }>(
    `SELECT it.code, it.name, COUNT(*)::int AS count
     FROM evaluation_tags et
     JOIN issue_tags it ON it.code = et.tag_code
     JOIN evaluations e ON e.id = et.evaluation_id
     JOIN order_items oi ON oi.id = e.order_item_id
     JOIN orders o ON o.id = oi.order_id
     JOIN restaurants r ON r.id = o.restaurant_id
     WHERE ${where}
     GROUP BY it.code
     ORDER BY count DESC`,
    params
  );
}

export async function getDishStats(f: Filters) {
  const { where, params } = buildOrderWhere(f);
  const where2 = where.replace(/o\./g, "o2.").replace(/r\./g, "r2.");
  return q<any>(
    `SELECT d.id, d.name,
            COUNT(oi.id)::int AS orders,
            COUNT(e.id)::int  AS eval,
            CASE WHEN COUNT(oi.id) = 0 THEN 0
                 ELSE ROUND(100.0 * COUNT(e.id) / COUNT(oi.id))::int
            END AS rate,
            (SELECT COUNT(*)::int FROM evaluation_tags et
               JOIN evaluations e2 ON e2.id = et.evaluation_id
               JOIN order_items oi2 ON oi2.id = e2.order_item_id
               JOIN orders o2 ON o2.id = oi2.order_id
               JOIN restaurants r2 ON r2.id = o2.restaurant_id
               WHERE oi2.dish_id = d.id AND ${where2}) AS errors
     FROM dishes d
     LEFT JOIN order_items oi ON oi.dish_id = d.id
     LEFT JOIN orders o ON o.id = oi.order_id
     LEFT JOIN restaurants r ON r.id = o.restaurant_id
     LEFT JOIN evaluations e ON e.order_item_id = oi.id
     WHERE ${where}
     GROUP BY d.id
     ORDER BY orders DESC`,
    [...params, ...params]
  );
}

export async function getManagerStats() {
  return q<any>(
    `SELECT m.id, m.name, r.name AS restaurant,
            COUNT(e.id)::int AS evals,
            (SELECT COUNT(*)::int FROM evaluation_tags et
               JOIN evaluations e2 ON e2.id = et.evaluation_id
               WHERE e2.manager_id = m.id) AS errors,
            CASE WHEN COUNT(e.id) = 0 THEN 0
                 ELSE ROUND(AVG(e.score))::int END AS score
     FROM managers m
     JOIN restaurants r ON r.id = m.restaurant_id
     LEFT JOIN evaluations e ON e.manager_id = m.id
     GROUP BY m.id, r.name
     ORDER BY evals DESC`
  );
}

export async function getRestaurantStats(f: Filters) {
  const { where, params } = buildOrderWhere(f);
  return q<any>(
    `SELECT r.id, r.name,
            COUNT(DISTINCT o.id)::int AS orders,
            COUNT(DISTINCT e.id)::int AS eval,
            CASE WHEN COUNT(DISTINCT o.id) = 0 THEN 0
                 ELSE ROUND(100.0 * COUNT(DISTINCT e.id) / COUNT(DISTINCT o.id))::int END AS rate,
            (SELECT COUNT(*)::int FROM evaluation_tags et
               JOIN evaluations e2 ON e2.id = et.evaluation_id
               JOIN order_items oi2 ON oi2.id = e2.order_item_id
               JOIN orders o2 ON o2.id = oi2.order_id
               WHERE o2.restaurant_id = r.id) AS errors
     FROM restaurants r
     LEFT JOIN orders o ON o.restaurant_id = r.id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN evaluations e ON e.order_item_id = oi.id
     WHERE ${where}
     GROUP BY r.id
     ORDER BY orders DESC`,
    params
  );
}

export type LiveOrder = {
  id: number;
  code: string;
  restaurant: string;
  table: string;
  customer: string;
  channel: string;
  placed_at: string;
  minutes: number;
  status: string;
  kot: string | null;
  ext_id: string | null;
  notes: string | null;
  order_type: string | null;
  items: { id: number; dish_id: number; dish: string; category: string; quantity: number; reference_image: string | null; evaluated: boolean; isAddon: boolean; noCapture: boolean }[];
};

const ADDON_CATEGORIES = new Set(["Add-Ons", "Extras"]);

async function buildOrders(rows: any[]): Promise<LiveOrder[]> {
  const now = Date.now();
  if (rows.length === 0) return [];
  const ids = rows.map((o) => o.id);
  const ph = ids.map(() => "?").join(",");
  const allItems = await q<any>(
    `SELECT oi.order_id, oi.id, oi.dish_id, d.name AS dish, d.category, oi.quantity, d.reference_image, oi.no_capture,
            EXISTS(SELECT 1 FROM evaluations e WHERE e.order_item_id = oi.id) AS evaluated
     FROM order_items oi
     JOIN dishes d ON d.id = oi.dish_id
     WHERE oi.order_id IN (${ph})`,
    ids
  );
  const byOrder = new Map<number, any[]>();
  for (const it of allItems) {
    const arr = byOrder.get(it.order_id) ?? [];
    arr.push(it); byOrder.set(it.order_id, arr);
  }
  const out: LiveOrder[] = [];
  for (const o of rows) {
    const items = byOrder.get(o.id) ?? [];
    out.push({
      id: o.id,
      code: o.code,
      restaurant: o.restaurant,
      table: o.table_no,
      customer: o.customer ?? "Guest",
      channel: o.channel ?? "POS",
      placed_at: o.placed_at,
      minutes: Math.max(0, Math.floor((now - new Date(o.placed_at).getTime()) / 60000)),
      status: o.status,
      kot: o.kot ?? null,
      ext_id: o.ext_id ?? null,
      notes: o.notes ?? null,
      order_type: o.order_type ?? null,
      items: items.map((i) => ({
        id: i.id,
        dish_id: i.dish_id,
        dish: i.dish,
        category: i.category,
        quantity: i.quantity,
        reference_image: i.reference_image,
        evaluated: !!i.evaluated,
        isAddon: ADDON_CATEGORIES.has(i.category),
        noCapture: !!i.no_capture,
      })),
    });
  }
  return out;
}

// Start of the current "business day" = the most recent 1:00 AM IST.
// Returned as a "YYYY-MM-DD HH:MM:SS" string to compare against placed_at (also IST).
function businessDayStartIST(): string {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  let y = ist.getUTCFullYear(), mo = ist.getUTCMonth(), d = ist.getUTCDate();
  if (ist.getUTCHours() < 1) {
    const prev = new Date(Date.UTC(y, mo, d) - 86400000);
    y = prev.getUTCFullYear(); mo = prev.getUTCMonth(); d = prev.getUTCDate();
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(mo + 1)}-${pad(d)} 01:00:00`;
}

// KDS feed: ALL of today's orders (since 1 AM). The Live/Past split (15-min rule)
// is done on the client. Orders before today's 1 AM naturally drop off at 1 AM.
export async function getLiveOrders(restaurant?: string): Promise<LiveOrder[]> {
  const where: string[] = ["o.placed_at >= ?"];
  const params: any[] = [businessDayStartIST()];
  if (restaurant && restaurant !== "All Restaurants") {
    where.push("r.name = ?");
    params.push(restaurant);
  }
  const orders = await q<any>(
    `SELECT o.id, o.code, o.placed_at, o.status, o.table_no, o.customer, o.channel, o.kot, o.ext_id, o.notes, o.order_type, r.name AS restaurant
     FROM orders o
     JOIN restaurants r ON r.id = o.restaurant_id
     WHERE ${where.join(" AND ")}
     ORDER BY o.placed_at DESC
     LIMIT 500`,
    params
  );
  return buildOrders(orders);
}

export async function getPastOrders(restaurant?: string): Promise<LiveOrder[]> {
  const where: string[] = ["o.status = 'served'", "substr(o.placed_at,1,10) < to_char(now(),'YYYY-MM-DD')"];
  const params: any[] = [];
  if (restaurant && restaurant !== "All Restaurants") {
    where.push("r.name = ?");
    params.push(restaurant);
  }
  const orders = await q<any>(
    `SELECT o.id, o.code, o.placed_at, o.status, o.table_no, o.customer, o.channel, o.kot, o.ext_id, o.notes, o.order_type, r.name AS restaurant
     FROM orders o
     JOIN restaurants r ON r.id = o.restaurant_id
     WHERE ${where.join(" AND ")}
     ORDER BY o.placed_at DESC
     LIMIT 60`,
    params
  );
  return buildOrders(orders);
}

export async function getOrderItemDetail(orderItemId: number) {
  return one<any>(
    `SELECT oi.id, oi.quantity, d.id AS dish_id, d.name AS dish, d.expected_grams, d.reference_image, d.monitored_tags,
            d.category, d.ai_criteria,
            o.code AS order_code, r.name AS restaurant,
            ev.image AS eval_image, ev.score AS eval_score, ev.status AS eval_status, ev.notes AS eval_notes
     FROM order_items oi
     JOIN dishes d ON d.id = oi.dish_id
     JOIN orders o ON o.id = oi.order_id
     JOIN restaurants r ON r.id = o.restaurant_id
     LEFT JOIN LATERAL (
       SELECT e.image, e.score, e.status, e.notes
       FROM evaluations e WHERE e.order_item_id = oi.id ORDER BY e.created_at DESC LIMIT 1
     ) ev ON true
     WHERE oi.id = ?`,
    [orderItemId]
  );
}

export async function listDishes() {
  return q<any>(
    `SELECT d.*,
            (SELECT COUNT(oi.id)::int FROM order_items oi WHERE oi.dish_id = d.id) AS orders,
            (SELECT COUNT(e.id)::int FROM evaluations e
               JOIN order_items oi ON oi.id = e.order_item_id
               WHERE oi.dish_id = d.id) AS eval
     FROM dishes d
     ORDER BY d.name`
  );
}

export async function listRestaurants() {
  return q<any>("SELECT * FROM restaurants ORDER BY name");
}

export async function createEvaluation(input: {
  orderItemId: number;
  managerId?: number | null;
  score: number;
  status: "Pass" | "Warn" | "Fail";
  weight_g?: number | null;
  temperature_c?: number | null;
  image?: string | null;
  notes?: string | null;
  tags?: string[];
}) {
  const row = await one<{ id: number }>(
    `INSERT INTO evaluations (order_item_id, manager_id, score, status, weight_g, temperature_c, image, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      input.orderItemId,
      input.managerId ?? null,
      input.score,
      input.status,
      input.weight_g ?? null,
      input.temperature_c ?? null,
      input.image ?? null,
      input.notes ?? null,
    ]
  );
  const evalId = row!.id;
  if (input.tags?.length) {
    for (const t of input.tags) {
      await run(
        "INSERT INTO evaluation_tags (evaluation_id, tag_code) VALUES (?, ?) ON CONFLICT DO NOTHING",
        [evalId, t]
      );
    }
  }
  return evalId;
}

export async function updateOrderStatus(orderId: number, status: string) {
  return run("UPDATE orders SET status = ? WHERE id = ?", [status, orderId]);
}

export async function getDishById(id: number) {
  return one<any>(
    `SELECT d.*,
            (SELECT COUNT(oi.id)::int FROM order_items oi WHERE oi.dish_id = d.id) AS orders,
            (SELECT COUNT(e.id)::int FROM evaluations e
               JOIN order_items oi ON oi.id = e.order_item_id
               WHERE oi.dish_id = d.id) AS eval
     FROM dishes d WHERE d.id = ?`,
    [id]
  );
}

export async function updateDish(
  id: number,
  patch: {
    name?: string;
    category?: string;
    expected_grams?: number;
    monitored_tags?: string[];
    reference_image?: string | null;
    reference_image_delivery?: string | null;
    description?: string | null;
    pp_item_id?: string | null;
    swiggy_item_id?: string | null;
    zomato_item_id?: string | null;
    bench_garnish?: string | null;
    bench_hygiene?: string | null;
    bench_portion?: string | null;
    bench_plating?: string | null;
    ai_criteria?: string[] | null;
  }
) {
  const cur = await one<any>("SELECT * FROM dishes WHERE id = ?", [id]);
  if (!cur) return null;
  const pick = <T>(v: T | undefined, fallback: T): T => (v === undefined ? fallback : v);
  await run(
    `UPDATE dishes SET name = ?, category = ?, expected_grams = ?, reference_image = ?, reference_image_delivery = ?,
            description = ?, pp_item_id = ?, swiggy_item_id = ?, zomato_item_id = ?,
            bench_garnish = ?, bench_hygiene = ?, bench_portion = ?, bench_plating = ?,
            ai_criteria = ?, monitored_tags = ?
     WHERE id = ?`,
    [
      patch.name ?? cur.name,
      patch.category ?? cur.category,
      patch.expected_grams ?? cur.expected_grams,
      pick(patch.reference_image, cur.reference_image),
      pick(patch.reference_image_delivery, cur.reference_image_delivery),
      pick(patch.description, cur.description),
      pick(patch.pp_item_id, cur.pp_item_id),
      pick(patch.swiggy_item_id, cur.swiggy_item_id),
      pick(patch.zomato_item_id, cur.zomato_item_id),
      pick(patch.bench_garnish, cur.bench_garnish),
      pick(patch.bench_hygiene, cur.bench_hygiene),
      pick(patch.bench_portion, cur.bench_portion),
      pick(patch.bench_plating, cur.bench_plating),
      patch.ai_criteria ? JSON.stringify(patch.ai_criteria) : cur.ai_criteria,
      patch.monitored_tags ? JSON.stringify(patch.monitored_tags) : cur.monitored_tags,
      id,
    ]
  );
  return one<any>("SELECT * FROM dishes WHERE id = ?", [id]);
}

export async function insertAiScore(s: {
  dish_id?: number | null;
  dish_name?: string | null;
  score?: number | null;
  verdict?: string | null;
  identified_as?: string | null;
  matches_expected?: number;
  summary?: string | null;
  criteria_json?: string | null;
}) {
  const row = await one<{ id: number }>(
    `INSERT INTO ai_scores (dish_id, dish_name, score, verdict, identified_as, matches_expected, summary, criteria_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      s.dish_id ?? null,
      s.dish_name ?? null,
      s.score ?? null,
      s.verdict ?? null,
      s.identified_as ?? null,
      s.matches_expected ?? 0,
      s.summary ?? null,
      s.criteria_json ?? null,
    ]
  );
  return row!.id;
}

export async function listAiScores(limit = 20) {
  return q<any>("SELECT * FROM ai_scores ORDER BY id DESC LIMIT ?", [limit]);
}
