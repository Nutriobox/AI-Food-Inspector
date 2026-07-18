# NutrioBox KDS — API contract for the native Android client

Everything the Android KDS needs from the existing backend. The backend is NOT being
rewritten: the native app is a client of these endpoints, exactly as the web app is.

Base URL (production): `https://kds.nutriobox.com`

---

## 1. Authentication

Auth is Supabase. The app signs in directly against Supabase, then sends the returned
access token to the NutrioBox API as a Bearer header.

**Sign in**

```
POST https://<project>.supabase.co/auth/v1/token?grant_type=password
apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>
Content-Type: application/json

{ "email": "outlet@nutriobox.com", "password": "..." }
```

Returns `access_token`, `refresh_token`, `expires_in`, and `user`.
`user.user_metadata.role` is `"outlet"` for outlet accounts.

**Every NutrioBox API call**

```
Authorization: Bearer <access_token>
```

**Token refresh** — access tokens are short-lived. Refresh before expiry:

```
POST https://<project>.supabase.co/auth/v1/token?grant_type=refresh_token
{ "refresh_token": "..." }
```

**401 handling** — any endpoint returns `401 {"error":"unauthorized"}` when the token
is missing, expired or invalid. On 401: refresh once, retry, and only then sign out.

> Store the refresh token in EncryptedSharedPreferences. Outlet phones stay signed in,
> so treat the device as a credential and require a device screen lock.

---

## 2. Endpoints

### GET `/api/kds?mode=live&restaurant=<name>`
The live order queue. `restaurant` is optional; omit it for all outlets.

```json
{ "orders": [ { "id": 123, "order_code": "PP-...", "restaurant": "Sector 63 Noida",
                "status": "cooking", "items": [ ... ] } ] }
```

Poll every 4s while the screen is foregrounded. Cache the last successful response
and render it when offline.

### GET `/api/kds/order-item/{id}`
Full detail for one item — this drives the capture screen.

```json
{
  "id": 456, "quantity": 1, "dish_id": 78, "dish": "Classic Paneer Tikka Pizza",
  "expected_grams": 365, "reference_image": "https://res.cloudinary.com/...",
  "monitored_tags": ["portion","presentation"], "category": "Pizza",
  "ai_criteria": "[\"Base is evenly covered\",\"Paneer is visible\"]",
  "order_code": "PP-...", "restaurant": "Sector 63 Noida",
  "eval_image": null, "eval_score": null, "eval_status": null,
  "eval_notes": null, "eval_weight": null
}
```

`ai_criteria` is a **JSON-encoded string array** — parse it, don't display it raw.
`reference_image` must be requested through a Cloudinary transform: insert
`f_auto,q_auto,w_800,c_limit/` after `/image/upload/`. Full-size originals stall on
outlet bandwidth.

### POST `/api/score`
Sends the photo to Gemini and returns the structured verdict. This is the slow call
(typically 3–8s).

```json
{ "image": "data:image/jpeg;base64,...",   // required, max 8 MB
  "criteria": ["...", "..."],              // parsed from ai_criteria
  "dishName": "Classic Paneer Tikka Pizza",
  "category": "Pizza",
  "expectedGrams": 365 }
```

Response:

```json
{ "result": {
    "criteria": [ { "criterion": "Base is evenly covered", "pass": true, "reason": "..." } ],
    "overallScore": 92,
    "verdict": "Pass",
    "summary": "..." },
  "model": "gemini-2.5-flash" }
```

Errors: `400` invalid image · `429` rate limited (back off and retry) ·
`502` Gemini unreachable or unparseable.

### POST `/api/evaluate`
Persists the evaluation. Call this **after** `/api/score` succeeds.

```json
{ "orderItemId": 456,
  "score": 92,
  "status": "Pass",              // "Pass" | "Warn" | "Fail"
  "weight_g": null,              // null unless a scale is connected - never send a guess
  "temperature_c": null,
  "image": "data:image/jpeg;base64,...",
  "notes": "...",
  "tags": [] }
```

Returns `{ "id": 789 }`.

### POST `/api/order-status`
```json
{ "orderId": 123, "status": "ready" }   // pending|cooking|plating|ready|served
```
Returns `{ "ok": true }`.

### POST `/api/ai-scores`
Logs the AI assessment for analytics. Fire-and-forget after `/api/evaluate`.

---

## 3. The capture flow

```
GET  /api/kds?mode=live                 -> pick an item
GET  /api/kds/order-item/{id}           -> reference image + ai_criteria
     [ camera capture, JPEG ~1920px, quality ~0.8 ]
POST /api/score                         -> verdict + per-criterion results
     [ show the operator what passed and what failed ]
POST /api/evaluate                      -> persist
POST /api/ai-scores                     -> log
```

Compress before upload. Full-resolution phone JPEGs are several MB and slow the
Gemini call without improving accuracy; ~1920px wide at quality 0.8 is the sweet spot.

---

## 4. Offline behaviour

The web app queues captures in IndexedDB and syncs when connectivity returns. The
native app should mirror this with Room:

1. Capture always succeeds locally — never block the operator on network.
2. Persist `{ orderItemId, imageFile, criteria, dishName, category, capturedAt }`.
3. A WorkManager job with network constraints drains the queue: `/api/score`,
   then `/api/evaluate`, then delete the row.
4. Show a pending count so staff know work is outstanding.
5. Store images as **files**, not blobs in the DB — SQLite rows have practical limits.

New orders still require connectivity; they originate in the cloud.

---

## 5. Weight

Weight capture is currently **off** (`lib/features.ts`, `WEIGHT_ENABLED = false`) —
the Raspberry Pi load-cell station was retired. Send `weight_g: null`.

Do not fabricate or estimate a weight. `expected_grams` is still returned per item so
the field can be reinstated when real scales exist.

---

## 6. Things that will bite you

- **`ai_criteria` is a JSON string**, not an array.
- **Cloudinary URLs need the transform injected**, or images stall on outlet wifi.
- **`/api/score` is slow.** Never call it on the main thread; show progress.
- **Gemini occasionally 502s.** Retry with backoff; don't surface a raw error.
- **Rate limiting is real** (429 on `/api/score`). Serialise captures per device.
- **401 means refresh, not sign-out** — outlet phones must not drop staff to a login
  screen mid-service because a token expired.
