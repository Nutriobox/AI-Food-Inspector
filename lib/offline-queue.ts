// Minimal IndexedDB-backed queue for evaluations captured while offline.
// Each queued capture is scored (Gemini) and saved once the connection returns.
export type PendingEval = {
  id: string;
  orderId: string;
  itemId: number;
  dishName: string;
  category?: string | null;
  criteria: string[];
  expectedGrams?: number | null;
  image: string;
  weight: number;
  createdAt: number;
};

const DB_NAME = "nutriobox-offline";
const STORE = "pending-evals";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueue(item: PendingEval): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function allPending(): Promise<PendingEval[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const out: PendingEval[] = [];
    const cursor = db.transaction(STORE, "readonly").objectStore(STORE).openCursor();
    cursor.onsuccess = () => {
      const c = cursor.result;
      if (c) { out.push(c.value as PendingEval); c.continue(); }
      else resolve(out.sort((a, b) => a.createdAt - b.createdAt));
    };
    cursor.onerror = () => reject(cursor.error);
  });
}

async function removePending(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function pendingCount(): Promise<number> {
  try { return (await allPending()).length; } catch { return 0; }
}

let syncing = false;

// Drain the queue: score each capture via Gemini, then persist the evaluation.
export async function syncPending(): Promise<{ synced: number; failed: number }> {
  if (syncing) return { synced: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { synced: 0, failed: 0 };
  syncing = true;
  let synced = 0, failed = 0;
  try {
    const items = await allPending();
    for (const it of items) {
      try {
        const sres = await fetch("/api/score", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: it.image, criteria: it.criteria, dishName: it.dishName, category: it.category ?? undefined, expectedGrams: it.expectedGrams ?? undefined }),
        });
        const sjson = await sres.json().catch(() => null);
        if (!sres.ok) { failed++; continue; }
        const r = (sjson && sjson.result) || {};
        const score = r.overallScore ?? 0;
        const status = r.verdict ?? (score >= 85 ? "Pass" : score >= 70 ? "Warn" : "Fail");
        const eres = await fetch("/api/evaluate", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderItemId: it.itemId, score, status, weight_g: Math.round(it.weight), temperature_c: null, image: it.image, notes: r.summary ?? null, tags: [] }),
        });
        if (!eres.ok) { failed++; continue; }
        await removePending(it.id);
        synced++;
      } catch { failed++; }
    }
  } finally { syncing = false; }
  if (synced > 0 && typeof window !== "undefined") window.dispatchEvent(new Event("nb-synced"));
  return { synced, failed };
}
