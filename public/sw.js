// NutrioBox offline-first service worker.
// Strategy: app shell + Next static assets + Cloudinary reference images are cached
// so the KDS keeps loading (and showing expected photos) on bad/no wifi. API calls
// are never cached — the IndexedDB queue handles offline writes.
const VERSION = "nb-v1";
const STATIC = VERSION + "-static";
const IMG = VERSION + "-img";
const PAGES = VERSION + "-pages";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch { return; }

  // Cloudinary reference images -> cache-first, revalidate in background.
  if (url.hostname === "res.cloudinary.com") { e.respondWith(cacheFirst(req, IMG)); return; }
  // Next.js immutable static assets -> cache-first.
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    e.respondWith(cacheFirst(req, STATIC)); return;
  }
  // API routes -> always network (dynamic + auth); let them fail offline.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;
  // Same-origin pages/assets -> network-first, fall back to cache when offline.
  if (url.origin === self.location.origin) { e.respondWith(networkFirst(req, PAGES)); return; }
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) {
    fetch(req).then((r) => { if (r && r.ok) cache.put(req, r.clone()); }).catch(() => {});
    return hit;
  }
  try {
    const r = await fetch(req);
    if (r && r.ok) cache.put(req, r.clone());
    return r;
  } catch { return hit || Response.error(); }
}

async function networkFirst(req, name) {
  const cache = await caches.open(name);
  try {
    const r = await fetch(req);
    if (r && r.ok) cache.put(req, r.clone());
    return r;
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    const root = await cache.match("/");
    return root || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}
