"use client";

import { useEffect, useState } from "react";
import { syncPending, pendingCount } from "@/lib/offline-queue";

// Offline-first controller: registers the service worker, tracks online/offline,
// drains the offline capture queue when the connection returns, and shows status.
export function PWA() {
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

    const refresh = async () => setPending(await pendingCount());
    const readState = () => setOffline(typeof navigator !== "undefined" && !navigator.onLine);
    const drain = async () => { if (typeof navigator !== "undefined" && navigator.onLine) { await syncPending(); await refresh(); } };

    readState(); refresh(); drain();

    const onOnline = () => { readState(); drain(); };
    const onOffline = () => { readState(); refresh(); };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const iv = setInterval(() => { refresh(); drain(); }, 20000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(iv);
    };
  }, []);

  if (!offline && pending === 0) return null;
  const bg = offline ? "#7A1F1F" : "#633806";
  const msg = offline
    ? `● Offline — captures are saved on this device${pending ? ` (${pending} waiting)` : ""} and will sync when the connection returns.`
    : `Syncing ${pending} offline capture${pending === 1 ? "" : "s"}…`;
  return (
    <div
      role="status"
      style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 9999,
        background: bg, color: "#fff", textAlign: "center", fontSize: 12, fontWeight: 600, padding: "7px 12px",
      }}
    >
      {msg}
    </div>
  );
}
