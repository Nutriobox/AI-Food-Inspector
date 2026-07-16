"use client";

import { useEffect, useState } from "react";

// Registers the service worker and shows an offline banner. Kept intentionally
// tiny and dependency-free so it can live in the root layout.
export function PWA() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const sync = () => setOffline(typeof navigator !== "undefined" && !navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 9999,
        background: "#7A1F1F", color: "#fff", textAlign: "center",
        fontSize: 12, fontWeight: 600, padding: "7px 12px",
      }}
    >
      ● Offline — showing saved data. Captures will sync automatically when the connection returns.
    </div>
  );
}
