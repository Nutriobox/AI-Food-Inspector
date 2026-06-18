import { db } from "./client";

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

export function getKpis(f: Filters) {
  const { where, params } = buildOrderWhere(f);
  const conn = db();
  const totalOrders = conn
    .prepare(`SELECT COUNT(*) as c FROM orders o JOIN restaurants r ON r.id = o.restaurant_id WHERE ${where}`)
    .get(...params) as { c: number };
  const evaluatedItems = conn
    .prepare(
      `SELECT COUNT(DISTINCT oi.order_id) as c
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN restaurants r ON r.id = o.restaurant_id
       WHERE ${where} AND EXISTS (SELECT 1 FROM evaluations e WHERE e.order_item_id = oi.id)`
    )
    .get(...params) as { c: number };
  const evaluated = evaluatedItems.c;
  const total = totalOrders.c;
  const missing = total - evaluated;
  const rate = total === 0 ? 0 : Math.round((evaluated / total) * 100);
  return { total, evaluated, missing, rate };
}

export function getDailySeries(f: Filters, kind: "orders" | "evals" | "errors") {
  const { where, params } = buildOrderWhere(f);
  const conn = db();
  if (kind === "orders") {
    return conn
      .prepare(
        `SELECT substr(o.placed_at, 1, 10) AS day, COUNT(*) AS y
         FROM orders o JOIN restaurants r ON r.id = o.restaurant_id
         WHERE ${where}
         GROUP BY day ORDER BY day`
      )
      .all(...params) as { day: string; y: number }[];
  }
  if (kind === "evals") {
    return conn
      .prepare(
        `SELECT substr(e.created_at, 1, 10) AS day, COUNT(*) AS y
         FROM evaluations e
         JOIN order_items oi ON oi.id = e.order_item_id
         JOIN orders o ON o.id = oi.order_id
         JOIN restaurants r ON r.id = o.restaurant_id
         WHERE ${where}
         GROUP BY day ORDER BY day`
      )
      .all(...params) as { day: string; y: number }[];
  }
  return conn
    .prepare(
      `SELECT substr(e.created_at, 1, 10) AS day, COUNT(*) AS y
       FROM evaluation_tags et
       JOIN evaluations e ON e.id = et.evaluation_id
       JOIN order_items oi ON oi.id = e.order_item_id
       JOIN orders o ON o.id = oi.order_id
       JOIN restaurants r ON r.id = o.restaurant_id
       WHERE ${where}
       GROUP BY day ORDER BY day`
    )
    .all(...params) as { day: string; y: number }[];
}

export function getRecentOrders(f: Filters, limit = 50) {
  const { where, params } = buildOrderWhere(f);
  const conn = db();
  const rows = conn
    .prepare(
      `SELECT o.id, o.code, o.placed_at, o.status,
              r.name AS restaurant,
              GROUP_CONCAT(d.name, ', ') AS dishes,
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
       GROUP BY o.id
       ORDER BY o.placed_at DESC
       LIMIT ?`
    )
    .all(...params, limit) as any[];
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

export function getEvaluations(f: Filters, limit = 50) {
  const { where, params } = buildOrderWhere(f);
  const conn = db();
  const rows = conn
    .prepare(
      `SELECT e.id AS eid, e.score, e.created_at, e.status AS evstatus,
              d.name AS dish,
              m.name AS manager,
              o.code AS order_code,
              (SELECT GROUP_CONCAT(et.tag_code) FROM evaluation_tags et WHERE et.evaluation_id = e.id) AS tags
       FROM evaluations e
       JOIN order_items oi ON oi.id = e.order_item_id
       JOIN orders o ON o.id = oi.order_id
       JOIN restaurants r ON r.id = o.restaurant_id
       JOIN dishes d ON d.id = oi.dish_id
       LEFT JOIN managers m ON m.id = e.manager_id
       WHERE ${where}
       ORDER BY e.created_at DESC
       LIMIT ?`
    )
    .all(...params, limit) as any[];
  return rows.map((r) => ({
    id: `EVL-${String(r.eid).padStart(5, "0")}`,
    time: new Date(r.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false }),
    dish: r.dish,
    score: r.score as number,
    tags: r.tags ? (r.tags as string).split(",") : [],
    manager: r.manager ?? "—",
  }));
}

export function getIssueAggregate(f: Filters) {
  const { where, params } = buildOrderWhere(f);
  const conn = db();
  return conn
    .prepare(
      `SELECT it.code, it.name, COUNT(*) AS count
       FROM evaluation_tags et
       JOIN issue_tags it ON it.code = et.tag_code
       JOIN evaluations e ON e.id = et.evaluation_id
       JOIN order_items oi ON oi.id = e.order_item_id
       JOIN orders o ON o.id = oi.order_id
       JOIN restaurants r ON r.id = o.restaurant_id
       WHERE ${where}
       GROUP BY it.code
       ORDER BY count DESC`
    )
    .all(...params) as { code: string; name: string; count: number }[];
}

export function getDishStats(f: Filters) {
  const { where, params } = buildOrderWhere(f);
  const conn = db();
  return conn
    .prepare(
      `SELECT d.id, d.name,
              COUNT(oi.id) AS orders,
              COUNT(e.id)  AS eval,
              CASE WHEN COUNT(oi.id) = 0 THEN 0
                   ELSE ROUND(100.0 * COUNT(e.id) / COUNT(oi.id))
              END AS rate,
              (SELECT COUNT(*) FROM evaluation_tags et
                 JOIN evaluations e2 ON e2.id = et.evaluation_id
                 JOIN order_items oi2 ON oi2.id = e2.order_item_id
                 JOIN orders o2 ON o2.id = oi2.order_id
                 JOIN restaurants r2 ON r2.id = o2.restaurant_id
                 WHERE oi2.dish_id = d.id AND ${where.replace(/o\./g, "o2.").replace(/r\./g, "r2.")}) AS errors
       FROM dishes d
       LEFT JOIN order_items oi ON oi.dish_id = d.id
       LEFT JOIN orders o ON o.id = oi.order_id
       LEFT JOIN restaurants r ON r.id = o.restaurant_id
       LEFT JOIN evaluations e ON e.order_item_id = oi.id
       WHERE ${where}
       GROUP BY d.id
       ORDER BY orders DESC`
    )
    .all(...params, ...params) as any[];
}

export function getManagerStats() {
  const conn = db();
  return conn
    .prepare(
      `SELECT m.id, m.name, r.name AS restaurant,
              COUNT(e.id) AS evals,
              (SELECT COUNT(*) FROM evaluation_tags et
                 JOIN evaluations e2 ON e2.id = et.evaluation_id
                 WHERE e2.manager_id = m.id) AS errors,
              CASE WHEN COUNT(e.id) = 0 THEN 0
                   ELSE ROUND(AVG(e.score)) END AS score
       FROM managers m
       JOIN restaurants r ON r.id = m.restaurant_id
       LEFT JOIN evaluations e ON e.manager_id = m.id
       GROUP BY m.id
       ORDER BY evals DESC`
    )
    .all() as any[];
}

export function getRestaurantStats(f: Filters) {
  const { where, params } = buildOrderWhere(f);
  const conn = db();
  return conn
    .prepare(
      `SELECT r.id, r.name,
              COUNT(DISTINCT o.id) AS orders,
              COUNT(DISTINCT e.id) AS eval,
              CASE WHEN COUNT(DISTINCT o.id) = 0 THEN 0
                   ELSE ROUND(100.0 * COUNT(DISTINCT e.id) / COUNT(DISTINCT o.id)) END AS rate,
              (SELECT COUNT(*) FROM evaluation_tags et
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
       ORDER BY orders DESC`
    )
    .all(...params) as any[];
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
  items: { id: number; dish_id: number; dish: string; category: string; quantity: number; reference_image: string | null; evaluated: boolean; isAddon: boolean }[];
};

// Categories that are treated as add-ons (rendered indented under the main items).
const ADDON_CATEGORIES = new Set(["Add-Ons", "Extras"]);

function buildOrders(rows: any[]): LiveOrder[] {
  const conn = db();
  const itemsStmt = conn.prepare(
    `SELECT oi.id, oi.dish_id, d.name AS dish, d.category, oi.quantity, d.reference_image,
            EXISTS(SELECT 1 FROM evaluations e WHERE e.order_item_id = oi.id) AS evaluated
     FROM order_items oi
     JOIN dishes d ON d.id = oi.dish_id
     WHERE oi.order_id = ?`
  );
  const now = Date.now();
  return rows.map((o) => {
    const items = itemsStmt.all(o.id) as any[];
    return {
      id: o.id,
      code: o.code,
      restaurant: o.restaurant,
      table: o.table_no,
      customer: o.customer ?? "Guest",
      channel: o.channel ?? "POS",
      placed_at: o.placed_at,
      minutes: Math.max(0, Math.floor((now - new Date(o.placed_at).getTime()) / 60000)),
      status: o.status,
      items: items.map((i) => ({
        id: i.id,
        dish_id: i.dish_id,
        dish: i.dish,
        category: i.category,
        quantity: i.quantity,
        reference_image: i.reference_image,
        evaluated: !!i.evaluated,
        isAddon: ADDON_CATEGORIES.has(i.category),
      })),
    };
  });
}

export function getLiveOrders(restaurant?: string): LiveOrder[] {
  const conn = db();
  const where: string[] = ["o.status != 'served'"];
  const params: any[] = [];
  if (restaurant && restaurant !== "All Restaurants") {
    where.push("r.name = ?");
    params.push(restaurant);
  }
  const orders = conn
    .prepare(
      `SELECT o.id, o.code, o.placed_at, o.status, o.table_no, o.customer, o.channel, r.name AS restaurant
       FROM orders o
       JOIN restaurants r ON r.id = o.restaurant_id
       WHERE ${where.join(" AND ")}
       ORDER BY o.placed_at DESC
       LIMIT 30`
    )
    .all(...params) as any[];
  return buildOrders(orders);
}

// Past orders = served orders placed before today (most recent first).
export function getPastOrders(restaurant?: string): LiveOrder[] {
  const conn = db();
  const where: string[] = ["o.status = 'served'", "substr(o.placed_at,1,10) < date('now','localtime')"];
  const params: any[] = [];
  if (restaurant && restaurant !== "All Restaurants") {
    where.push("r.name = ?");
    params.push(restaurant);
  }
  const orders = conn
    .prepare(
      `SELECT o.id, o.code, o.placed_at, o.status, o.table_no, o.customer, o.channel, r.name AS restaurant
       FROM orders o
       JOIN restaurants r ON r.id = o.restaurant_id
       WHERE ${where.join(" AND ")}
       ORDER BY o.placed_at DESC
       LIMIT 60`
    )
    .all(...params) as any[];
  return buildOrders(orders);
}

export function getOrderItemDetail(orderItemId: number) {
  const conn = db();
  return conn
    .prepare(
      `SELECT oi.id, oi.quantity, d.id AS dish_id, d.name AS dish, d.expected_grams, d.reference_image, d.monitored_tags,
              o.code AS order_code, r.name AS restaurant
       FROM order_items oi
       JOIN dishes d ON d.id = oi.dish_id
       JOIN orders o ON o.id = oi.order_id
       JOIN restaurants r ON r.id = o.restaurant_id
       WHERE oi.id = ?`
    )
    .get(orderItemId) as any;
}

export function listDishes() {
  return db()
    .prepare(
      `SELECT d.*,
              (SELECT COUNT(oi.id) FROM order_items oi WHERE oi.dish_id = d.id) AS orders,
              (SELECT COUNT(e.id) FROM evaluations e
                 JOIN order_items oi ON oi.id = e.order_item_id
                 WHERE oi.dish_id = d.id) AS eval
       FROM dishes d
       ORDER BY d.name`
    )
    .all() as any[];
}

export function listRestaurants() {
  return db().prepare("SELECT * FROM restaurants ORDER BY name").all() as any[];
}

export function createEvaluation(input: {
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
  const conn = db();
  const info = conn
    .prepare(
      `INSERT INTO evaluations (order_item_id, manager_id, score, status, weight_g, temperature_c, image, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.orderItemId,
      input.managerId ?? null,
      input.score,
      input.status,
      input.weight_g ?? null,
      input.temperature_c ?? null,
      input.image ?? null,
      input.notes ?? null
    );
  const evalId = info.lastInsertRowid as number;
  if (input.tags?.length) {
    const tagStmt = conn.prepare(
      "INSERT OR IGNORE INTO evaluation_tags (evaluation_id, tag_code) VALUES (?, ?)"
    );
    for (const t of input.tags) tagStmt.run(evalId, t);
  }
  return evalId;
}

export function updateOrderStatus(orderId: number, status: string) {
  return db().prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, orderId);
}

export function getDishById(id: number) {
  return db()
    .prepare(
      `SELECT d.*,
              (SELECT COUNT(oi.id) FROM order_items oi WHERE oi.dish_id = d.id) AS orders,
              (SELECT COUNT(e.id) FROM evaluations e
                 JOIN order_items oi ON oi.id = e.order_item_id
                 WHERE oi.dish_id = d.id) AS eval
       FROM dishes d WHERE d.id = ?`
    )
    .get(id) as any;
}

export function updateDish(
  id: number,
  patch: {
    name?: string;
    category?: string;
    expected_grams?: number;
    monitored_tags?: string[];
    reference_image?: string | null;
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
  const conn = db();
  const cur = conn.prepare("SELECT * FROM dishes WHERE id = ?").get(id) as any;
  if (!cur) return null;
  const pick = <T>(v: T | undefined, fallback: T): T => (v === undefined ? fallback : v);
  conn
    .prepare(
      `UPDATE dishes SET name = ?, category = ?, expected_grams = ?, reference_image = ?,
              description = ?, pp_item_id = ?, swiggy_item_id = ?, zomato_item_id = ?,
              bench_garnish = ?, bench_hygiene = ?, bench_portion = ?, bench_plating = ?,
              ai_criteria = ?, monitored_tags = ?
       WHERE id = ?`
    )
    .run(
      patch.name ?? cur.name,
      patch.category ?? cur.category,
      patch.expected_grams ?? cur.expected_grams,
      pick(patch.reference_image, cur.reference_image),
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
      id
    );
  return conn.prepare("SELECT * FROM dishes WHERE id = ?").get(id);
}
