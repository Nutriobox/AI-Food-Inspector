# Build brief — NutrioBox KDS, native Android app

Hand this file **and `ANDROID_API.md`** to the AI coding tool. `ANDROID_API.md` is the
authoritative API contract; this document is the product and engineering spec.

---

## 0. Decisions already made — do not revisit

| Decision | Value |
| --- | --- |
| **Language** | **Kotlin** (change this line to Java if preferred; nothing else changes) |
| Min SDK / Target SDK | 26 / 35 |
| Scope of this build | **KDS only.** The Food Inspector dashboard stays a web app. |
| Backend | **Already exists. Do NOT rebuild it.** This app is a client of the documented API. |
| Distribution | Private — Play Console internal testing track. Not a public listing. |
| Weight capture | **Off.** Always send `weight_g: null`. Never estimate a weight. |

---

## 1. What this app is for

NutrioBox runs 10 healthy-food outlets in Delhi NCR. Kitchen staff need to (a) see live
orders arriving from the Petpooja POS and (b) photograph each plated dish so an AI
scores it against that dish's visual quality criteria before it leaves the kitchen.

One dedicated Android phone sits in each outlet kitchen, permanently signed in to that
outlet's account. Staff are not technical, often have wet or gloved hands, and the
kitchen wifi is unreliable. **Design for that:** large touch targets, high contrast,
minimal typing, and never lose a capture because the network dropped.

---

## 2. Screens

### 2.1 Login
Email + password against Supabase (see `ANDROID_API.md` §1). Persist the refresh token
in `EncryptedSharedPreferences`. Staff sign in once; the device stays signed in.

### 2.2 Live order queue — the home screen
- Polls `GET /api/kds?mode=live` every 4 seconds while foregrounded.
- Shows order code, outlet, elapsed time, and the items in each order.
- Caches the last successful response to Room; renders it when offline.
- **Keeps the screen on** (`FLAG_KEEP_SCREEN_ON`) — a sleeping KDS is useless.
- Persistent status strip: `Online` / `Offline — showing last known queue` /
  `Syncing N captures…`.
- Tapping an item opens the capture screen.

### 2.3 Capture and evaluate — the core screen
Layout, top to bottom:
1. Dish name, order code, outlet.
2. **Reference photo** (`reference_image`, with the Cloudinary transform applied) beside
   the **live camera preview**, so staff can compare before shooting.
3. A large **Capture** button — minimum 64dp tall, full width, reachable one-handed.
4. After capture: the photo, a **Retake** button, and the scoring result.

Scoring result must show:
- The verdict (Pass / Warn / Fail) with colour: `#EAF3DE`/`#27500A`, `#FAEEDA`/`#633806`,
  `#FCEBEB`/`#791F1F` for background/foreground respectively.
- `X of Y checks passed (Z%)`.
- **Every criterion listed individually**, each marked pass or fail, with the AI's reason
  for any failure. Staff must be able to see exactly what was wrong, not just a score.

Do **not** show any "identified as / does not match expected item" line. It was removed
from the web app deliberately because it produced false negatives.

### 2.4 Settings
Current outlet, pending-sync count with a manual "Sync now", app version, sign out.

---

## 3. Camera

Use **CameraX**.

- Rear camera, continuous autofocus, flash auto.
- Capture at ~1920px on the long edge, JPEG quality ~0.8. Do not upload full-resolution
  images: they are several MB, slow the AI call, and do not improve accuracy.
- Correct EXIF rotation before upload — a sideways photo scores badly.
- Release the camera in `onPause`, reacquire in `onResume`.
- If permission is denied, explain why the app needs it and link to settings. Never
  crash or show a blank preview.

---

## 4. Data layer and offline behaviour

This is the part that matters most. **A capture must never be lost.**

**Room schema**

```
PendingCapture(
  id, orderItemId, imagePath, criteriaJson, dishName, category,
  capturedAt, attemptCount, lastError
)
CachedOrder(key, payloadJson, fetchedAt)
```

Store photos as **files** in app-private storage; keep only the path in the database.

**Sync via WorkManager**, constrained to `NetworkType.CONNECTED`, with exponential
backoff. For each pending capture, in order:

1. `POST /api/score` → verdict
2. `POST /api/evaluate` → persist
3. `POST /api/ai-scores` → log
4. Delete the row and its image file

Rules:
- Capture always succeeds locally and returns immediately. Never block the operator on
  the network.
- Serialise uploads — one at a time per device. `/api/score` is rate limited and returns
  429 if hammered.
- On 429 or 502, retry with backoff. Do not surface a raw error to kitchen staff.
- On 401, refresh the token once and retry before ever signing the user out.
- Surface the pending count so staff know work is outstanding.

---

## 5. New-order alerts

Staff must not have to stare at the screen.

Implement a **foreground service** that continues polling `/api/kds` and raises a
**local notification with sound and vibration** when an order appears that wasn't in the
previous response. This needs no backend change.

Do not implement Firebase Cloud Messaging in this phase — it would require server-side
work that is out of scope here.

---

## 6. Configuration and secrets

Required at build time, supplied via `local.properties` and exposed through
`BuildConfig`:

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
API_BASE_URL=https://kds.nutriobox.com
```

- **Never commit `local.properties` or any key.** Add it to `.gitignore`.
- The Supabase **anon** key is the only key this app ever holds. The service-role key
  must never appear in the app — it bypasses all row-level security.
- The app signing keystore is generated and held by the client, not by you.

---

## 7. Non-negotiables

1. **Do not rebuild or modify the backend.** No new endpoints, no direct database
   access, no Gemini calls from the device. Everything goes through the documented API.
2. **Never fabricate a weight.** Send `weight_g: null`.
3. **`ai_criteria` is a JSON-encoded string**, not an array. Parse it.
4. **Cloudinary URLs need `f_auto,q_auto,w_800,c_limit/` inserted** after
   `/image/upload/`, or images stall on outlet wifi.
5. **`/api/score` takes 3–8 seconds.** Never call it on the main thread. Show progress.
6. Brand green is `#1E4221`.
7. No analytics SDKs, no ad SDKs, no crash reporters that ship photos off-device. The
   images are of a client's food and belong to them.

---

## 8. Definition of done

The build is complete when all of the following pass on a real phone:

- [ ] Sign in as an outlet account; app remains signed in after a reboot.
- [ ] Live queue updates within ~5s of a new Petpooja order.
- [ ] Screen does not sleep while the queue is open.
- [ ] A new order raises an audible notification when the app is backgrounded.
- [ ] Capture a dish: verdict, percentage, and every individual criterion with reasons
      are all displayed.
- [ ] **Enable airplane mode.** Capture three dishes. All three succeed locally and the
      pending count reads 3.
- [ ] **Disable airplane mode.** All three sync automatically without user action, and
      the pending count returns to 0.
- [ ] Force-quit the app with items pending; on relaunch they are still queued and sync.
- [ ] Expire the access token; the app refreshes and continues without signing the user
      out.
- [ ] Deny camera permission: a clear explanation appears, no crash.
- [ ] Release APK builds and installs; no secret appears in the repository.

---

## 9. Deliverables

1. Android Studio project, buildable with `./gradlew assembleRelease`.
2. `README.md` covering setup, `local.properties` keys, and how to build a release.
3. Signed release APK, or an AAB for the Play Console internal track.
4. A short note listing anything deliberately left out.

---

## 10. Build order

Ship in this sequence so there is something testable early:

1. Login + token storage and refresh.
2. Live queue with polling and Room caching.
3. CameraX capture screen.
4. Score/evaluate calls with the full criteria breakdown.
5. Room queue + WorkManager offline sync. **Test with airplane mode before moving on.**
6. Foreground service and new-order notifications.
7. Release signing and internal-track packaging.
