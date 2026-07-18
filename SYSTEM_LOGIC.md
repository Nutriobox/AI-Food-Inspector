# NutrioBox — complete system logic

Everything the platform does and every rule it enforces, written so an Android app can
be built without reading the Next.js source. Pair this with `ANDROID_API.md` (endpoint
shapes) and `ANDROID_BUILD_BRIEF.md` (build spec).

---

## 1. Purpose

NutrioBox operates 10 healthy-food outlets in Delhi NCR. Orders arrive from Swiggy,
Zomato and the in-store POS through **Petpooja**. Before a dish leaves the kitchen,
staff photograph it; **Google Gemini** judges the photo against that dish's own visual
criteria and returns a pass/fail per criterion plus an overall verdict. Every result is
stored and rolls up into management analytics.

The point is to catch a badly made dish **before** the customer receives it, and to
build a record of which dishes, outlets and shifts have quality problems.

---

## 2. Actors

| Role | Where | Can do |
| --- | --- | --- |
| **Outlet staff** (`role = "outlet"`) | KDS on the outlet phone | See the live queue, capture and evaluate items, configure dishes. Restricted by middleware to `/orders/live`, `/dish-config` and `/api/*` — every other path redirects back to the queue. |
| **Head office / admin** | Food Inspector web app | All analytics, menu library, evaluations history, outlet and manager reports. |
| **Petpooja** (machine) | Webhooks | Pushes menu, orders and stock toggles. Authenticated by token + IP allowlist, not by user login. |

---

## 3. Domain model

**restaurants** — `id`, `name` (unique), `city`, `pp_rest_id` (maps a Petpooja outlet ID
to a NutrioBox outlet).

**dishes** — the menu library, the heart of the configuration.
`id`, `name`, `category`, `expected_grams` (default 250), `reference_image` (Dine In),
`reference_image_delivery` (Delivery), `description`, `ai_criteria`, `monitored_tags`,
`pp_item_id`, `pp_addon_id`, `pp_active`, `pp_active_at`.

- **`ai_criteria` is a JSON-encoded string array**, e.g. `"[\"Base evenly covered\",\"Paneer visible\"]"`. Parse it; never display raw.
- **`monitored_tags`** is likewise a JSON string, defaulting to `["NC","WG","ID","WP","NI"]`.
- `pp_active` drives the green "Live" dot in the menu library, set by the menu push and toggled by the stock webhook.

**orders** — `id`, `code` (unique), `restaurant_id`, `table_no`, `customer`, `channel`
(`POS` | `Swiggy` | `Zomato`), `placed_at`, `status`, plus Petpooja fields `kot`,
`ext_id`, `notes`, `order_type`.

**order_items** — `id`, `order_id`, `dish_id`, `quantity`, `no_capture`.

**evaluations** — `id`, `order_item_id`, `manager_id`, `score` (0–100), `status`
(`Pass`|`Warn`|`Fail`), `weight_g` (nullable), `temperature_c` (nullable), `image`
(base64 data URL), `notes`, `created_at`.

**evaluation_tags** — many-to-many between an evaluation and `issue_tags`.

**ai_scores** — an analytics log of every AI assessment: `dish_id`, `dish_name`,
`score`, `verdict`, `summary`, `criteria_json`, `created_at`.

**pp_menu_addons** — add-on master from Petpooja: `addon_id`, `name`, `price`,
`group_name`, `rest_id`, `in_stock`. **Price here decides whether an add-on needs a photo.**

**petpooja_events** — raw capture of every inbound webhook, for debugging.

---

## 4. Order lifecycle

```
Petpooja POST /api/petpooja/webhook
  -> log raw payload to petpooja_events (always, even if auth fails)
  -> verify token + source IP; reject 401 if bad
  -> map pp restaurant id -> restaurants.pp_rest_id
  -> map order_from -> channel (Swiggy / Zomato / POS)
  -> INSERT orders + order_items (matching dishes by pp_item_id / pp_addon_id)
  -> duplicate order id? re-sync add-on camera flags from the CURRENT payload price
```

Order status values: `pending` → `cooking` → `plating` → `ready` → `served`, changed via
`POST /api/order-status`.

### The business-day rule

The KDS feed returns **all orders since the most recent 1:00 AM IST**, not "today" by
calendar date. A kitchen working past midnight keeps seeing its orders; the board clears
itself at 1 AM. Any client reimplementing this must use the same boundary or the queue
will empty mid-shift.

### Live vs Past

The API returns one list; the **client** splits it. An order is **complete** (moves to
Past) when:

```
evaluatable = items where noCapture == false
complete    = evaluatable.length > 0 AND every evaluatable item is evaluated
```

An order consisting only of `no_capture` items is **never** complete and stays on the
live board. Past orders sort newest first.

`minutes` (elapsed since `placed_at`) is computed server-side and drives the timer.

---

## 5. Add-ons and the no-camera rule

Not everything on a ticket is photographable. A sauce or a choice-of-base needs no
quality check; an extra portion of paneer does.

- Categories `"Add-Ons"` and `"Extras"` are flagged `isAddon` and render in a separate
  section of the order card.
- **`no_capture`** is set per order item at ingestion: an add-on that is a condiment
  **and** has `price == 0` gets `no_capture = true` → no camera, no evaluation required.
- Priced add-ons are real food → camera shown, evaluation required.
- On a duplicate/edited order the flags are **re-synced from the current payload price**,
  so a price correction changes the camera behaviour retroactively.

The Android app must honour `noCapture`: hide capture UI, and exclude those items from
the completeness calculation above.

---

## 6. Dish configuration

Each dish is configured once in the menu library, and configuration quality determines
scoring quality.

- **Reference images** — two: Dine In (`reference_image`) and Delivery
  (`reference_image_delivery`). Staff compare against these when plating.
- **`ai_criteria`** — the yes/no visual checks Gemini judges. This is the single biggest
  lever on accuracy.
- **`expected_grams`** — retained even though weight is currently off.

**Configuration status** (`lib/dish-status.ts`) is derived from exactly two fields —
`reference_image` and `description`:

| Both present | `configured` | green `#639922` |
| Exactly one | `partial` | amber `#EF9F27` |
| Neither | `not_configured` | red `#E24B4A` |

Dishes whose name or category contains `[sb]` or `[sbn]` are **excluded** from the menu
library listing.

---

## 7. AI scoring — the core logic

**Request** (`POST /api/score`): `image` (data URL, max 8 MB), `criteria[]` (parsed from
`ai_criteria`), `dishName`, `category`, `expectedGrams`.

**Prompt sent to Gemini**, in effect:

> You are a strict food-quality inspector for the dish "<name>" (category: <category>).
> Look at the photo of the prepared item and judge it against each criterion.
> Criteria: 1. … 2. … 3. …
> For EACH numbered criterion, add exactly one matching entry to the "criteria" array,
> in the same order. Respond ONLY with a single complete, minified JSON object …

If no criteria are configured, it falls back to judging: correct dish, garnish/toppings,
plating & presentation, cleanliness.

**Model config — do not change these without testing:**

| Setting | Value | Why |
| --- | --- | --- |
| model | `gemini-2.5-flash` | |
| `temperature` | 0.2 | Consistency across repeat captures |
| `responseMimeType` | `application/json` | |
| `maxOutputTokens` | 2048 | |
| **`thinkingConfig.thinkingBudget`** | **0** | **Critical.** With thinking on, 2.5 Flash truncates its JSON mid-object and scoring fails with "Could not parse the AI response". |

**Response handling:** strip markdown fences, `JSON.parse`; if that fails, regex out the
first `{...}` block and retry the parse; only then give up with a 502.

**Retries:** on 503 / 429 / 500 the server retries 4 times with 0.9s, 1.8s, 2.7s backoff.

**Rate limit:** 60 requests per 60 seconds per IP → 429.

**Result shape:** `criteria[] {criterion, pass, reason}`, `overallScore` 0–100,
`verdict` Pass|Warn|Fail, `summary`.

### Verdict thresholds

Gemini returns a verdict. If it is missing, the client derives it from the score:

```
score >= 85 -> Pass
score >= 70 -> Warn
else        -> Fail
```

Verdict colours (background / foreground):
`Pass #EAF3DE / #27500A` · `Warn #FAEEDA / #633806` · `Fail #FCEBEB / #791F1F`

### What the operator must see

All criteria listed individually, each pass/fail, with the reason for failures, plus
`X of Y checks passed (Z%)`.

**Do not display any "identified as / does not match expected item" line.** It was
removed deliberately: it produced false negatives on correctly made dishes, firing even
when the score was 100.

---

## 8. Saving an evaluation

After a successful score:

1. `POST /api/evaluate` → inserts an `evaluations` row, plus `evaluation_tags` for any
   issue tags. Returns `{id}`.
2. `POST /api/ai-scores` → logs the assessment for analytics.

`getOrderItemDetail` returns the **most recent** evaluation for an item
(`ORDER BY created_at DESC LIMIT 1`), so re-evaluating adds a row rather than replacing
one — the history is preserved.

Once any evaluation exists for an item it counts as `evaluated`, which feeds the Live/Past
completeness rule in §4.

---

## 9. Issue tags

Manual quality tags attached to an evaluation:

| Code | Meaning |
| --- | --- |
| NC | Not Cooked |
| WG | Wrong Garnish |
| ID | Incorrect Dish |
| WP | Wrong Portion |
| NI | Not Identified |
| IM | Incorrect Mix |
| CI | Cleanliness Issue |

Each dish carries `monitored_tags` (default `NC, WG, ID, WP, NI`) indicating which
matter for that dish.

---

## 10. Weight

**Currently disabled.** `lib/features.ts` → `WEIGHT_ENABLED = false`.

History: outlets ran a Raspberry Pi with an HX711 load cell serving
`http://127.0.0.1:8765/weight`. The cell failed conclusively (25 kg of body weight moved
the ADC 49 counts against a 450-count noise floor), and the ~₹2 lakh station was retired
in favour of phones.

Rules that still apply:

- Send `weight_g: null`. **Never estimate or fabricate a weight.**
- `expected_grams` is still stored per dish.
- When a scale exists again, tolerance is **±15%** of `expected_grams`; outside that the
  item is flagged.
- If a scale is connected but its readings swing more than **15 g**, treat it as
  untrusted, show "Scale unstable", and save `null` — a failing load cell still reports
  `ok: true`.

---

## 11. Authentication and access control

Supabase Auth. `user.user_metadata.role` is `"outlet"` or absent (admin).

- Web clients authenticate by cookie; **native clients send `Authorization: Bearer <jwt>`**.
- `/api/*` returns `401 {"error":"unauthorized"}` — never an HTML redirect.
- Public paths: `/login`, `/auth`, `/api/petpooja`, `/sw.js`, `/manifest.webmanifest`.
- Outlet accounts are confined to `/orders/live`, `/dish-config` and `/api/*`.
- Landing page after login: outlet → `/orders/live`, admin → `/overview`.

**Kiosk mode:** `kds.nutriobox.com` always runs KDS-only. On other hosts `?kiosk=1`
enables it and persists in localStorage; `?kiosk=0` clears it.

---

## 12. Offline behaviour

Outlet wifi is unreliable; this is a first-class requirement, not a nicety.

- Service worker caches the app shell, static assets and Cloudinary images.
- The **last KDS order list is cached** and rendered when the network is gone.
- Captures made offline go to an IndexedDB queue and sync automatically on reconnect:
  `/api/score` → `/api/evaluate` → remove from queue.
- A pending count is shown so staff know work is outstanding.
- **New orders require connectivity** — they originate in the cloud.

A native app should mirror this with Room + WorkManager. Images belong on the filesystem,
with only paths in the database.

---

## 13. Images

Reference images live on Cloudinary. **Always request a transform** — insert
`f_auto,q_auto,w_800,c_limit/` immediately after `/image/upload/` in the URL. Originals
are multi-megabyte and stall on outlet bandwidth; transformed they are ~50 KB.

Captured photos are stored as base64 data URLs on the evaluation row. Capture at ~1920px
long edge, JPEG quality ~0.8 — full-resolution phone images slow the Gemini call without
improving accuracy.

---

## 14. Analytics (head office, for context)

Derived from evaluations and orders, filtered by outlet and date range: KPIs, daily
series (orders / evaluations / errors), recent orders, evaluation history, issue-tag
aggregates, per-dish stats, per-manager stats, per-outlet stats.

The Android app does not need these — the Food Inspector web app covers them — but the
evaluations it writes are what populate them, which is why `score`, `status`, tags and
`created_at` must be accurate.

---

## 15. Gotchas that have already cost time

1. **`thinkingBudget: 0`** or Gemini truncates its JSON.
2. **`ai_criteria` and `monitored_tags` are JSON strings**, not arrays.
3. **Cloudinary transforms are mandatory** on outlet bandwidth.
4. **Business day starts at 1 AM IST**, not midnight.
5. **`no_capture` items must be excluded** from order-completeness or orders never leave
   the live board.
6. **A 401 means refresh the token**, not sign the operator out mid-service.
7. **`/api/score` takes 3–8 seconds** and is rate limited to 60/min per IP. Serialise it.
8. **Never fabricate a weight.**
9. **Never show the "identified as" line.**
