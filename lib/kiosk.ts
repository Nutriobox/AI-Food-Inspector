// KDS-only "kiosk" mode for the in-outlet machine.
// Turn ON  by opening any page with ?kiosk=1  (persists in this browser).
// Turn OFF by opening any page with ?kiosk=0.
export const KIOSK_KEY = "nb_kiosk";

export function readKiosk(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KIOSK_KEY) === "1";
}

export function syncKioskFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  const v = new URLSearchParams(window.location.search).get("kiosk");
  if (v === "1") window.localStorage.setItem(KIOSK_KEY, "1");
  else if (v === "0") window.localStorage.removeItem(KIOSK_KEY);
  return readKiosk();
}
