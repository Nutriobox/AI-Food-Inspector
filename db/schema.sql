-- Nutriobox SQLite schema (frontend-only — single database file)

CREATE TABLE IF NOT EXISTS restaurants (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL UNIQUE,
  city      TEXT NOT NULL DEFAULT 'Bengaluru'
);

CREATE TABLE IF NOT EXISTS managers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id)
);

CREATE TABLE IF NOT EXISTS dishes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'Indian Main',
  expected_grams  INTEGER NOT NULL DEFAULT 250,
  reference_image TEXT,
  description     TEXT,
  pp_item_id      TEXT,
  swiggy_item_id  TEXT,
  zomato_item_id  TEXT,
  bench_garnish   TEXT,
  bench_hygiene   TEXT,
  bench_portion   TEXT,
  bench_plating   TEXT,
  ai_criteria     TEXT,
  monitored_tags  TEXT NOT NULL DEFAULT '["NC","WG","ID","WP","NI"]'
);

CREATE TABLE IF NOT EXISTS issue_tags (
  code  TEXT PRIMARY KEY,
  name  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
  table_no      TEXT,
  customer      TEXT,
  channel       TEXT NOT NULL DEFAULT 'POS',
  placed_at     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS order_items (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id  INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  dish_id   INTEGER NOT NULL REFERENCES dishes(id),
  quantity  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS evaluations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  manager_id    INTEGER REFERENCES managers(id),
  score         INTEGER NOT NULL,
  status        TEXT NOT NULL,
  weight_g      INTEGER,
  temperature_c REAL,
  image         TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS evaluation_tags (
  evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  tag_code      TEXT NOT NULL REFERENCES issue_tags(code),
  PRIMARY KEY (evaluation_id, tag_code)
);

CREATE INDEX IF NOT EXISTS idx_orders_placed_at ON orders(placed_at);
CREATE INDEX IF NOT EXISTS idx_orders_status    ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_evals_created    ON evaluations(created_at);

CREATE TABLE IF NOT EXISTS ai_scores (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  dish_id          INTEGER,
  dish_name        TEXT,
  score            INTEGER,
  verdict          TEXT,
  identified_as    TEXT,
  matches_expected INTEGER,
  summary          TEXT,
  criteria_json    TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
