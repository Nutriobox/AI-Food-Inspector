/**
 * Seed the SQLite DB with realistic Nutriobox data.
 * Run: npm run db:seed
 */
import { readFileSync } from "fs";
import { join } from "path";
import { db } from "./client";

const conn = db();

console.log("Wiping existing data…");
conn.exec(`
  DELETE FROM evaluation_tags;
  DELETE FROM evaluations;
  DELETE FROM order_items;
  DELETE FROM orders;
  DELETE FROM dishes;
  DELETE FROM managers;
  DELETE FROM restaurants;
  DELETE FROM issue_tags;
`);

const TAGS: [string, string][] = [
  ["NC", "Not Cooked"],
  ["WG", "Wrong Garnish"],
  ["ID", "Incorrect Dish"],
  ["WP", "Wrong Portion"],
  ["NI", "Not Identified"],
  ["IM", "Incorrect Mix"],
  ["CI", "Cleanliness Issue"],
];
const insertTag = conn.prepare("INSERT INTO issue_tags (code, name) VALUES (?, ?)");
for (const [c, n] of TAGS) insertTag.run(c, n);

const RESTAURANTS = [
  "NutrioBox (DLF Phase 2)",
  "NutrioBox (Rajinder Nagar)",
  "NutrioBox (Sector 63 Noida)",
  "NutrioBox (Dwarka)",
  "NutrioBox (Janakpuri)",
  "NutrioBox (Karkardooma)",
  "NutrioBox (Noida)",
  "NutrioBox (Prashant Vihar)",
  "NutrioBox (Sector 15, Gurugram)",
  "NutrioBox (Shivalik)",
];
const insertResto = conn.prepare("INSERT INTO restaurants (name) VALUES (?)");
const restoIds: Record<string, number> = {};
for (const r of RESTAURANTS) {
  const info = insertResto.run(r);
  restoIds[r] = info.lastInsertRowid as number;
}

// One manager per outlet.
const MANAGERS = [
  ["Aarav Sharma", "aarav@nutriobox.com", "NutrioBox (DLF Phase 2)"],
  ["Riya Kapoor", "riya@nutriobox.com", "NutrioBox (Rajinder Nagar)"],
  ["Mahir Patel", "mahir@nutriobox.com", "NutrioBox (Sector 63 Noida)"],
  ["Sana Iyer", "sana@nutriobox.com", "NutrioBox (Dwarka)"],
  ["Kabir Mehta", "kabir@nutriobox.com", "NutrioBox (Janakpuri)"],
  ["Ananya Rao", "ananya@nutriobox.com", "NutrioBox (Karkardooma)"],
  ["Vivaan Gupta", "vivaan@nutriobox.com", "NutrioBox (Noida)"],
  ["Diya Nair", "diya@nutriobox.com", "NutrioBox (Prashant Vihar)"],
  ["Reyansh Singh", "reyansh@nutriobox.com", "NutrioBox (Sector 15, Gurugram)"],
  ["Aisha Khan", "aisha@nutriobox.com", "NutrioBox (Shivalik)"],
];
const insertMgr = conn.prepare("INSERT INTO managers (name, email, restaurant_id) VALUES (?, ?, ?)");
for (const [n, e, r] of MANAGERS) insertMgr.run(n, e, restoIds[r]);

// Real Nutriobox menu, generated from the Product Master Report (Dine In items).
// See data/dishes.json — regenerate that file to change the menu.
type SeedDish = { name: string; category: string; ref: string; grams: number; tags: string[]; img?: string | null };
const DISHES = JSON.parse(
  readFileSync(join(process.cwd(), "data", "dishes.json"), "utf-8")
) as SeedDish[];
const insertDish = conn.prepare(
  "INSERT INTO dishes (name, category, expected_grams, reference_image, description, pp_item_id, swiggy_item_id, zomato_item_id, monitored_tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
);
const dishIds: Record<string, number> = {};
let ppCounter = 10001;
for (const d of DISHES) {
  // Only the real Cloudinary expected-image URL counts as a configured image.
  const refImage = d.img ?? null;
  const hasImage = !!d.img;

  // Realistic spread of configuration completeness:
  //  - items WITH an expected image -> also get a description + full POS/aggregator
  //    integration => "Configured" (green).
  //  - about half the remaining items get a Petpooja link only => "Partially" (yellow).
  //  - the rest have nothing beyond the menu name => "Not configured" (red).
  const description = hasImage
    ? `${d.name} — plated to the standard ${d.grams}g ${d.category.toLowerCase()} portion.`
    : null;
  const ppId = hasImage || Math.random() < 0.5 ? `PP-${ppCounter++}` : null;
  const swiggyId = hasImage ? `SW-${Math.floor(100000 + Math.random() * 899999)}` : null;
  const zomatoId = hasImage ? `ZM-${Math.floor(100000 + Math.random() * 899999)}` : null;

  const info = insertDish.run(
    d.name, d.category, d.grams, refImage, description, ppId, swiggyId, zomatoId, JSON.stringify(d.tags)
  );
  dishIds[d.name] = info.lastInsertRowid as number;
}
console.log(`Loaded ${DISHES.length} menu items.`);

function pad(n: number, w: number) { return String(n).padStart(w, "0"); }
function pickOne<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

const insertOrder = conn.prepare(
  "INSERT INTO orders (code, restaurant_id, table_no, customer, channel, placed_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)"
);
const CUSTOMERS = [
  "Divyansh", "Shalu", "Shweta", "Saniya", "Parth", "Saurabh", "Cheshna", "Sanoj",
  "Rohan", "Aditi", "Karan", "Megha", "Vikram", "Ananya", "Rahul", "Pooja",
  "Ishaan", "Neha", "Arjun", "Tanya", "Dev", "Simran", "Yash", "Kriti",
];
const CHANNELS = ["Swiggy", "Swiggy", "Zomato", "Zomato", "POS"]; // weighted toward aggregators
const insertItem = conn.prepare(
  "INSERT INTO order_items (order_id, dish_id, quantity) VALUES (?, ?, ?)"
);
const insertEval = conn.prepare(
  "INSERT INTO evaluations (order_item_id, manager_id, score, status, weight_g, temperature_c, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
);
const insertEvalTag = conn.prepare(
  "INSERT INTO evaluation_tags (evaluation_id, tag_code) VALUES (?, ?)"
);

const STATUSES = ["pending", "cooking", "plating", "ready"];
const dishNames = Object.keys(dishIds);
const restoArr = Object.keys(restoIds);
const managerIds = (conn.prepare("SELECT id FROM managers").all() as { id: number }[]).map((r) => r.id);

const now = new Date();
let orderCounter = 72000;
let totalOrders = 0;
let totalEvals = 0;

for (let dayOffset = 30; dayOffset >= 0; dayOffset--) {
  const day = new Date(now);
  day.setDate(day.getDate() - dayOffset);
  const ordersToday = Math.floor(70 + Math.random() * 60);

  for (let i = 0; i < ordersToday; i++) {
    const hh = Math.floor(8 + Math.random() * 14);
    const mm = Math.floor(Math.random() * 60);
    const placedAt = new Date(day);
    placedAt.setHours(hh, mm, 0, 0);

    const code = `ORD-${pad(orderCounter++, 5)}`;
    const restoName = pickOne(restoArr);
    const restoId = restoIds[restoName];
    const tableNo = `T-${pad(Math.floor(Math.random() * 14) + 1, 2)}`;
    const isLive = dayOffset <= 1 && Math.random() < 0.35;
    const status = isLive ? pickOne(STATUSES) : "served";
    const customer = pickOne(CUSTOMERS);
    const channel = pickOne(CHANNELS);
    const orderInfo = insertOrder.run(code, restoId, tableNo, customer, channel, placedAt.toISOString(), status);
    const orderId = orderInfo.lastInsertRowid as number;
    totalOrders++;

    const dishCount = 1 + Math.floor(Math.random() * 3);
    const used = new Set<string>();
    for (let d = 0; d < dishCount; d++) {
      let name = pickOne(dishNames);
      while (used.has(name)) name = pickOne(dishNames);
      used.add(name);
      const qty = 1 + Math.floor(Math.random() * 2);
      const itemInfo = insertItem.run(orderId, dishIds[name], qty);
      const itemId = itemInfo.lastInsertRowid as number;

      if (Math.random() < 0.14) {
        const score = Math.floor(50 + Math.random() * 50);
        const evalStatus = score >= 85 ? "Pass" : score >= 70 ? "Warn" : "Fail";
        const weight = Math.floor(180 + Math.random() * 220);
        const temp = Math.round((50 + Math.random() * 30) * 10) / 10;
        const evalInfo = insertEval.run(itemId, pickOne(managerIds), score, evalStatus, weight, temp, null, placedAt.toISOString());
        const evalId = evalInfo.lastInsertRowid as number;
        totalEvals++;
        if (score < 85) {
          const tagPool = ["NC", "WG", "ID", "WP", "NI", "IM", "CI"];
          const nTags = score < 70 ? 2 : 1;
          const seen = new Set<string>();
          for (let t = 0; t < nTags; t++) {
            let tag = pickOne(tagPool);
            while (seen.has(tag)) tag = pickOne(tagPool);
            seen.add(tag);
            insertEvalTag.run(evalId, tag);
          }
        }
      }
    }
  }
}

console.log(`Seeded ${totalOrders} orders and ${totalEvals} evaluations.`);
console.log("Done.");
