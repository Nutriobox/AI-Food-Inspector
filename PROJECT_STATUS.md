# Nutriobox — Food Quality Platform · Project Status & Handoff

> Paste the contents of this file into a new Cowork chat on the other laptop to bring the assistant up to speed.
> Last updated: 16 June 2026.

## What this project is
A Next.js app for Nutriobox's multi-outlet food business. Three modes (top nav):
- **Analytics** — dashboards (Overview KPIs + charts, Recent Orders, Evaluations, Order Issues, Dishes, Managers, Restaurants, Analytics).
- **Configuration** — dish setup (name, category, portion, monitored quality tags).
- **KDS** (Kitchen Display System) — live orders + an evaluate/capture screen.

Project folder: `C:\nutriobox-app`

## Current tech stack (as built)
- Next.js 14 (App Router) + React 18 + TypeScript + Tailwind CSS
- Data: **SQLite** via better-sqlite3 (local file `data/nutriobox.db`) — *to be migrated to Supabase/Postgres*
- TanStack React Query, Recharts, Zod, lucide-react, sonner (toasts)

## Target rebuild stack (per the BRD)
Frontend: Next.js + TypeScript + Tailwind · Backend: Next.js + **Supabase (PostgreSQL)** · Charts: Recharts · Images: **Cloudinary** · Deploy: **Vercel**.
A full Business Requirements Document was produced (PDF) describing this rebuild.

## How to run (on any machine)
```
cd C:\nutriobox-app
npm install
npm run db:reset      # wipes + recreates the SQLite DB with the real menu + images
npm run dev           # then open http://localhost:3000
```
If port 3000 is busy: `npm run dev -- -p 3001`.

## What has been built / changed (this work)
1. **Fixed broken pages** — orders, evaluations, order-issues, dishes, managers, restaurants page files were truncated/corrupted and wouldn't compile; all rebuilt. App now compiles cleanly.
2. **Real menu data** — replaced the 12 sample dishes with the real Nutriobox menu from "Product Master Report.xlsx" (≈235 dishes) → `data/dishes.json`. Seed loads from this file.
3. **Dish QA data + expected images** — from "Dish QA data 30-03-26.xlsx": 144 dishes, 142 with **Cloudinary expected-image URLs**. Merged into `data/dishes.json` (image + weight) and built a client lookup `lib/dish-images.json` (dish name → image URL). The KDS evaluate screen shows the dish's Cloudinary photo as the "Expected image".
4. **Filters** — the chip "×" now removes a filter; date defaults are **empty** (no date selected on load → shows all data). `components/filter-context.tsx`, `components/filter-bar.tsx`.
5. **Charts** — fixed an area-chart bug where the fill rendered solid black (SVG gradient id contained spaces). `components/chart-card.tsx`.
6. **KDS page redesign** (`app/(dashboard)/orders/live/page.tsx`) to match the reference KDS:
   - Left sidebar: **Live Orders / Past Orders** tabs (side by side) + **Item Summary** (aggregated item counts, in the same sequence as the order cards, most-recent first), full-height with its own scroll.
   - Yellow order cards: order #, customer, item count, **channel badge** (Swiggy/Zomato/POS), live elapsed timer, placed time. Add-ons shown with an **"ADD ON"** label.
   - Uniform card size; full-page width; window scrollbar on the far right.
   - Item name turns **green** once its photo is captured, **red** if not. Camera icon becomes an **(i)** icon after capture.
7. **Capture / evaluate flow** (`app/(dashboard)/orders/live/[orderId]/[itemId]/evaluate/page.tsx`):
   - Stripped to Expected image | Live camera, with a **Capture** button centered below.
   - Camera now **releases properly** on leaving the page (no more webcam-stays-on bug).
   - Title shows the dish name (passed via `?dish=` query param).
   - If a photo already exists → 3-box view: Expected | **Captured** | Live + a **Recapture** button (deletes old photo for that order+item, saves new).
8. **Past Orders logic** — an order auto-moves from Live to Past once **every item has a captured photo**; Past is ordered by completion time (most recently completed first). Computed client-side from capture records.
9. **Schema/seed additions** — `orders` table gained `customer` and `channel` columns; seed generates customer names + Swiggy/Zomato/POS channels and spreads evaluation dates across the month.

## Important data / storage notes
- **Captured KDS photos are stored in the browser's localStorage** (`lib/captures.ts`), keyed by order+item. They do NOT transfer between machines/browsers and are a temporary testing mechanism. When Supabase + Cloudinary are wired, switch save/delete/recapture to persist server-side against the order ID.
- The KDS currently shows **sample test orders** (hard-coded in the page to mirror the reference screenshot) when there's no live feed. Real orders will come from Petpooja → the same UI.
- A few items have no expected image because they weren't in the QA sheet's "Configured" tab (most add-ons, plus Classic Paneer Tikka Pizza, Make Your Own Protein Shake, Frothy Cappuccino).

## Key files
- `app/(dashboard)/orders/live/page.tsx` — KDS (live/past, item summary, cards)
- `app/(dashboard)/orders/live/[orderId]/[itemId]/evaluate/page.tsx` — capture / recapture screen
- `lib/captures.ts` — localStorage capture store · `lib/dish-images.json` — dish→image map
- `data/dishes.json` — dish master (name, category, portion, tags, img) · `db/seed.ts`, `db/schema.sql`, `db/queries.ts`
- `components/filter-context.tsx`, `components/filter-bar.tsx`, `components/chart-card.tsx`

## Outstanding / next steps
- [ ] Connect **Petpooja API** for real live Zomato/Swiggy/POS orders.
- [ ] Migrate SQLite → **Supabase (Postgres)** with RLS; move captures + images to **Cloudinary**; persist server-side.
- [ ] **Supabase Auth** (real login + roles: Admin / Manager).
- [ ] Deploy to **Vercel**.
- [ ] (Optional) Add expected images for the unconfigured items; decide whether add-ons need QA photos.

## Moving between laptops
- The chat history does NOT sync across machines (Cowork chats are stored locally). Use this file as the handoff.
- Recommended: push the project to **GitHub** and `git clone` / `git pull` on the other laptop instead of copying the folder (skip copying `node_modules`; run `npm install`).
