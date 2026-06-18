import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "nutriobox.db");
const SCHEMA_PATH = path.join(process.cwd(), "db", "schema.sql");

let cached: Database.Database | null = null;

// Columns that may be missing on databases created by an older schema.
// Added on connect so existing data is preserved (no reseed required).
const DISH_COLUMNS: Record<string, string> = {
  description: "TEXT",
  pp_item_id: "TEXT",
  swiggy_item_id: "TEXT",
  zomato_item_id: "TEXT",
  bench_garnish: "TEXT",
  bench_hygiene: "TEXT",
  bench_portion: "TEXT",
  bench_plating: "TEXT",
  ai_criteria: "TEXT",
};

function migrate(conn: Database.Database) {
  const hasDishes = conn
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='dishes'")
    .get();
  if (!hasDishes) return;
  const existing = new Set(
    (conn.prepare("PRAGMA table_info(dishes)").all() as { name: string }[]).map((c) => c.name)
  );
  for (const [col, type] of Object.entries(DISH_COLUMNS)) {
    if (!existing.has(col)) conn.exec(`ALTER TABLE dishes ADD COLUMN ${col} ${type}`);
  }
}

export function db(): Database.Database {
  if (cached) return cached;
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  const isFresh = !fs.existsSync(DB_PATH);
  const conn = new Database(DB_PATH);
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  if (isFresh && fs.existsSync(SCHEMA_PATH)) {
    conn.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
  }
  migrate(conn);
  cached = conn;
  return conn;
}
