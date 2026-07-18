# CLAUDE.md — NutrioBox AI Food Inspector

Context for AI assistants working in this repo. Read this before making changes.

## What this is

AI-assisted food quality control for NutrioBox (10 healthy-food outlets, Delhi NCR).
Staff photograph each plated dish; Google Gemini scores it against per-item visual
criteria and returns a pass/fail per criterion plus an overall verdict. Results feed
management analytics dashboards.

One Next.js codebase serves **two apps**, branched on the `host` header:

| Host | App | Users | Entry |
| --- | --- | --- | --- |
| `kds.nutriobox.com` | NutrioBox KDS | Outlet staff | `/orders/live` |
| `aifoodinspector.nutriobox.com` | Food Inspector | Head office | `/` |

Host branching lives in `app/layout.tsx` (`isKds`), `app/manifest.webmanifest/route.ts`,
and `lib/kiosk.ts` (`KIOSK_HOSTS`).

## Stack

Next.js 14 App Router · React 18 · TypeScript · Tailwind · TanStack Query · Zod ·
Supabase (managed Postgres + Auth, accessed via `pg`) · Google Gemini 2.5 Flash ·
Cloudinary (reference images) · Vercel (deploy) · Recharts · Sonner.

## Repo layout

```
app/(dashboard)/(analytics)/   overview, orders, evaluations, dishes, managers,
                               order-issues, restaurants, analytics
app/(dashboard)/orders/live/   KDS queue + capture/evaluate screen (core flow)
app/(dashboard)/dish-config/   menu library: reference photos, expected weight, AI criteria
app/(dashboard)/petpooja-menu/ unified menu synced from Petpooja
app/api/score/                 calls Gemini, returns structured verdict
app/api/evaluate/              persists an evaluation
app/api/petpooja/              menu · webhook (orders) · stock (item on/off)
app/manifest.webmanifest/      per-host PWA manifest (route handler, NOT a static file)
components/                    shared UI, incl. pwa.tsx (SW registration + sync)
db/                            Postgres client, SQL, schema
lib/                           api, offline-queue (IndexedDB), captures, features, utils
pi-weight-service/             Python HX711 service — LEGACY, see "Retired hardware"
public/                        sw.js, logos
```

## Current state (July 2026)

**Phone-first.** The project moved off a Raspberry Pi + HX711 capture station
(~₹2 lakh/outlet) to a dedicated Android phone per outlet running the app as an
installable PWA. The phone camera is materially better than the old USB webcam,
which directly improves Gemini scoring accuracy.

**Weight capture is OFF.** `lib/features.ts` exports `WEIGHT_ENABLED: boolean = false`.
With it false the app hides the weight UI, does not poll `127.0.0.1:8765` (which on a
phone fails every 500ms and drains battery), and stores `weight_g` as `null`.
`expected_grams` is still stored per dish, so flipping the flag restores the feature.
Do NOT delete the weight code paths.

**Retired hardware.** `pi-weight-service/` is kept for reference only. The load cell
failed diagnostics conclusively: body weight (~25kg) shifted the raw ADC value by 49
counts against a 450-count noise floor, and in the opposite direction to a 190g phone.
Do not spend time debugging it; the component is being removed, not repaired.

**Offline-first is live.** Service worker (`public/sw.js`) caches app shell, static
assets and Cloudinary images; `lib/offline-queue.ts` is an IndexedDB queue that stores
captures made offline and auto-syncs when back online; last KDS order list is cached.
`lib/captures.ts` separately uses localStorage (~5-10MB ceiling) for capture thumbnails.

## Non-obvious constraints — read before you break something

**Vercel blocks commits from unauthorized authors.** Commits MUST be authored as
`Mayank <mayank@nutriobox.com>` (the repo's git config). A commit authored as anyone
else causes Vercel to mark the deployment **Blocked**. Never hardcode a different author.

**Gemini 2.5 Flash truncates JSON unless thinking is disabled.** `app/api/score/route.ts`
sets `thinkingConfig: { thinkingBudget: 0 }` plus `maxOutputTokens` and strips markdown
fences before parsing. Removing this reintroduces "Could not parse the AI response".

**Middleware must keep PWA files public.** `middleware.ts` `PUBLIC_PREFIXES` includes
`/sw.js` and `/manifest.webmanifest`. Without these the service worker silently fails
to register because the requests 302 to `/login`.

**The manifest is a route handler, not a static file.** `public/manifest.webmanifest`
was deleted on purpose — a file in `public/` shadows the route and would serve both
domains the same app name and icon.

**Cloudinary images must go through `cldThumb()`** (`lib/utils.ts`), which injects
`f_auto,q_auto,w_*,c_limit`. Full-size originals stall on outlet bandwidth.

**Never commit:** `.env.local`, `outlet-login-credentials.csv`, `outlet-logins.csv`,
`outlet-logins.xlsx` (all gitignored — keep it that way). Never commit API keys.

## Environment variables

`DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL` (optional),
`PETPOOJA_TOKEN`, `PETPOOJA_MENU_IPS`, `NEXT_PUBLIC_WEIGHT_URL` (optional, legacy).

## Commands

```bash
npm run dev        # local dev
npm run build      # production build
npm run lint
npm run typecheck  # tsc --noEmit
```

Deployment is git-triggered: push to `main` and Vercel builds both domains.

## Conventions

- Comments explain **why**, not what. Existing comments encode hard-won context —
  don't strip them.
- All DB access goes through API routes, never from client components.
- Client components fetch via `lib/api.ts` + TanStack Query.
- Brand green is `#1E4221`.
