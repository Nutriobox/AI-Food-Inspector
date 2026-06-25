// KDS-only "kiosk" mode for the in-outlet machine.
//
// Two ways kiosk mode turns ON:
//   1. The machine's own domain (kds.nutriobox.com) ALWAYS runs in kiosk mode.
//   2. On any other host, opening a page with ?kiosk=1 turns it on (persists);
//      ?kiosk=0 turns it off. (Handy for testing on the Vercel URL / laptop.)
export const KIOSK_KEY = "nb_kiosk";

// Hostnames that are locked to KDS-only mode no matter what.
const KIOSK_HOSTS = ["kds.nutriobox.com"];

function hostIsKiosk(): boolean {
  if (typeof window === "undefined") return false;
  return KIOSK_HOSTS.includes(window.location.hostname.toLowerCase());
}

export function readKiosk(): boolean {
  if (typeof window === "undefined") return false;
  if (hostIsKiosk()) return true; // the machine domain always wins
  return window.localStorage.getItem(KIOSK_KEY) === "1";
}

export function syncKioskFromUrl(): boolean {
  if (typeof window === "undefined") return false;
  if (hostIsKiosk()) return true; // ignore ?kiosk overrides on the machine domain
  const v = new URLSearchParams(window.location.search).get("kiosk");
  if (v === "1") window.localStorage.setItem(KIOSK_KEY, "1");
  else if (v === "0") window.localStorage.removeItem(KIOSK_KEY);
  return readKiosk();
}
