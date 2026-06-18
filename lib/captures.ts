// Client-side persistence for captured item photos, keyed by order + item.
// Stored in localStorage so a captured photo survives navigation and reloads.
// (When the Petpooja/Supabase backend is wired, swap these for API calls.)

export type CaptureRecord = { dataUrl: string; capturedAt: string };

const keyFor = (orderId: number | string, itemId: number | string) =>
  `nb-capture:${orderId}:${itemId}`;

const CHANGED_EVENT = "nb-captures-changed";

export function getCapture(orderId: number | string, itemId: number | string): CaptureRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(orderId, itemId));
    return raw ? (JSON.parse(raw) as CaptureRecord) : null;
  } catch {
    return null;
  }
}

export function hasCapture(orderId: number | string, itemId: number | string): boolean {
  return getCapture(orderId, itemId) !== null;
}

export function saveCapture(orderId: number | string, itemId: number | string, dataUrl: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      keyFor(orderId, itemId),
      JSON.stringify({ dataUrl, capturedAt: new Date().toISOString() } satisfies CaptureRecord)
    );
    window.dispatchEvent(new Event(CHANGED_EVENT));
  } catch {}
}

export function deleteCapture(orderId: number | string, itemId: number | string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(keyFor(orderId, itemId));
    window.dispatchEvent(new Event(CHANGED_EVENT));
  } catch {}
}

export const CAPTURES_CHANGED_EVENT = CHANGED_EVENT;
