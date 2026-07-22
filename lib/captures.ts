// Client-side persistence for captured item photos, keyed by order + item.
//
// Storage is localStorage, which has a hard ~5MB ceiling per origin. That ceiling
// is easy to hit: a capture is a base64 data URL, and base64 inflates bytes by ~33%.
// Two rules follow from that, and both were previously broken:
//
//   1. A quota error must NEVER be swallowed. It used to be, so once storage filled
//      the photo was silently discarded and reopening the item showed nothing.
//      We now evict the oldest captures and retry, and report failure to the caller.
//
//   2. Existence checks must not touch the payload. hasCapture() runs in the render
//      path for every item of every order, several times per poll; parsing a
//      multi-hundred-KB JSON record just to answer "is it there?" made the KDS crawl
//      on the outlet machine. A tiny key index, cached in memory, answers it O(1).

export type CaptureRecord = { dataUrl: string; capturedAt: string };

const PREFIX = "nb-capture:";
const INDEX_KEY = "nb-capture-index";
const CHANGED_EVENT = "nb-captures-changed";

const keyFor = (orderId: number | string, itemId: number | string) =>
  `${PREFIX}${orderId}:${itemId}`;

// key -> saved-at epoch ms. Small enough to parse freely; the payloads are not.
type Index = Record<string, number>;
let indexCache: Index | null = null;

function readIndex(): Index {
  if (indexCache) return indexCache;
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(INDEX_KEY);
    indexCache = raw ? (JSON.parse(raw) as Index) : {};
  } catch {
    indexCache = {};
  }
  return indexCache!;
}

function writeIndex(ix: Index) {
  indexCache = ix;
  try { window.localStorage.setItem(INDEX_KEY, JSON.stringify(ix)); } catch {}
}

// Recover the index from the raw keys. Used once if the index is missing or stale
// (e.g. captures written by an older build of the app).
function rebuildIndex(): Index {
  const ix: Index = {};
  if (typeof window === "undefined") return ix;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(PREFIX)) ix[k] = 0; // unknown age -> evict first
    }
  } catch {}
  writeIndex(ix);
  return ix;
}

export function getCapture(orderId: number | string, itemId: number | string): CaptureRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(orderId, itemId));
    return raw ? (JSON.parse(raw) as CaptureRecord) : null;
  } catch {
    return null;
  }
}

// O(1) existence check - deliberately does NOT read or parse the image payload.
export function hasCapture(orderId: number | string, itemId: number | string): boolean {
  if (typeof window === "undefined") return false;
  const key = keyFor(orderId, itemId);
  let ix = readIndex();
  if (Object.keys(ix).length === 0) ix = rebuildIndex();
  return key in ix;
}

/**
 * Persist a capture. Returns false if it could not be stored even after evicting
 * older captures - the caller must surface that, because a lost photo means the
 * operator believes work is saved when it is not.
 */
export function saveCapture(
  orderId: number | string,
  itemId: number | string,
  dataUrl: string
): boolean {
  if (typeof window === "undefined") return false;
  const key = keyFor(orderId, itemId);
  const payload = JSON.stringify({ dataUrl, capturedAt: new Date().toISOString() } satisfies CaptureRecord);

  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      window.localStorage.setItem(key, payload);
      const ix = readIndex();
      ix[key] = Date.now();
      writeIndex(ix);
      window.dispatchEvent(new Event(CHANGED_EVENT));
      return true;
    } catch {
      // Almost certainly QuotaExceededError. Drop the oldest capture and retry.
      // The photo also lives on the evaluation row server-side, so evicting an old
      // local copy loses only the offline convenience copy, never the record.
      let ix = readIndex();
      if (Object.keys(ix).length === 0) ix = rebuildIndex();
      const entries = Object.entries(ix).filter(([k]) => k !== key);
      if (entries.length === 0) return false; // nothing left to free
      entries.sort((a, b) => a[1] - b[1]);
      const [oldest] = entries[0];
      try { window.localStorage.removeItem(oldest); } catch {}
      delete ix[oldest];
      writeIndex(ix);
    }
  }
  return false;
}

export function deleteCapture(orderId: number | string, itemId: number | string) {
  if (typeof window === "undefined") return;
  const key = keyFor(orderId, itemId);
  try { window.localStorage.removeItem(key); } catch {}
  const ix = readIndex();
  if (key in ix) { delete ix[key]; writeIndex(ix); }
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export const CAPTURES_CHANGED_EVENT = CHANGED_EVENT;
