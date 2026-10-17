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

-- Free add-ons (Petpooja price 0) are shown on the KDS without a camera/photo step.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS no_capture BOOLEAN NOT NULL DEFAULT false;

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

-- Petpooja live order feed (added for webhook integration)
-- restaurants.pp_rest_id maps a Petpooja outlet ID to a Nutriobox outlet.
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS pp_rest_id TEXT;

-- Raw capture of every incoming Petpooja webhook call (for inspection/debugging).
CREATE TABLE IF NOT EXISTS petpooja_events (
  id              SERIAL PRIMARY KEY,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  token_ok        BOOLEAN NOT NULL DEFAULT false,
  rest_id         TEXT,
  pp_order_id     TEXT,
  channel         TEXT,
  mapped_order_id INTEGER,
  note            TEXT,
  raw             JSONB
);

-- Petpooja MENU add-on prices (item master). Populated by /api/petpooja/menu.
-- The camera on the KDS keys off price here: price > 0 -> real food -> show camera; 0 -> no camera.
-- addon_id matches the order payload's addon_id, so we map order add-ons to their real menu price.
CREATE TABLE IF NOT EXISTS pp_menu_addons (
  addon_id    TEXT PRIMARY KEY,
  name        TEXT,
  price       NUMERIC NOT NULL DEFAULT 0,
  group_name  TEXT,
  rest_id     TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Petpooja live/active status -> drives the green "Live" indicator on the Menu Library.
-- Set from the menu push (item in_stock/active) and toggled by /api/petpooja/stock.
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS pp_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS pp_active_at TIMESTAMPTZ;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS pp_addon_id TEXT;
ALTER TABLE pp_menu_addons ADD COLUMN IF NOT EXISTS in_stock BOOLEAN NOT NULL DEFAULT true;

-- Second reference image: reference_image = Dine In, reference_image_delivery = Delivery.
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS reference_image_delivery TEXT;

-- Raw capture of every incoming PACT voucher webhook (factory-stage events).
-- Populated by /api/vouchers/pact-webhook. Every event is stored first, then validated,
-- so nothing is lost even if the token or event type is wrong.
CREATE TABLE IF NOT EXISTS pact_events (
  id           SERIAL PRIMARY KEY,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  token_ok     BOOLEAN NOT NULL DEFAULT false,
  event        TEXT,          -- PMR / STOCK_RECEIPT / ISSUE_TO_PRODUCTION / WIP / FG_RECEIPT / SECONDARY
  voucher_no   TEXT,
  note         TEXT,
  raw          JSONB
);
CREATE INDEX IF NOT EXISTS idx_pact_events_received ON pact_events(received_at);
CREATE INDEX IF NOT EXISTS idx_pact_events_event    ON pact_events(event);


-- ─── BILLING COLUMNS (added 2026-10-17) ──────────────────────────────────────
-- Populated from PetPooja's Global Sales API webhook payload (same hook that
-- already lands at /api/petpooja/webhook). Historical rows were backfilled from
-- petpooja_events.raw on the same day.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS invoice_no       TEXT,
  ADD COLUMN IF NOT EXISTS payment_type     TEXT,
  ADD COLUMN IF NOT EXISTS customer_phone   TEXT,
  ADD COLUMN IF NOT EXISTS customer_address TEXT,
  ADD COLUMN IF NOT EXISTS biller           TEXT,
  ADD COLUMN IF NOT EXISTS order_total      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS core_total       NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS tax_total        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS discount_total   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS round_off        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS service_charge   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS delivery_charges NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS packaging_charge NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS taxes_json       JSONB,
  ADD COLUMN IF NOT EXISTS discounts_json   JSONB;
CREATE INDEX IF NOT EXISTS idx_orders_invoice_no ON orders(invoice_no);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS unit_price    NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS item_total    NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS item_tax      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS item_discount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS item_code     TEXT,
  ADD COLUMN IF NOT EXISTS sap_code      TEXT;
