"use client";

import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type PactEvent = {
  id: number;
  received_at: string;
  token_ok: boolean;
  event: string | null;
  voucher_no: string | null;
  note: string | null;
  raw: unknown;
};

export default function PactEventsPage() {
  const [openId, setOpenId] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["pact-events"],
    queryFn: () => api<{ events: PactEvent[] }>("/api/pact-events"),
    refetchInterval: 5000, // refresh every 5s so new events appear on their own
  });

  const events = data?.events ?? [];
  const fmt = (t: string) => { try { return new Date(t).toLocaleString("en-IN"); } catch { return t; } };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold tracking-tight" style={{ color: "#1E4221" }}>PACT Events</h1>
      <p className="text-sm text-muted mt-1">
        Every voucher PACT sends to <span className="num">/api/vouchers/pact-webhook</span>. Auto-refreshes every 5s.
      </p>

      {isLoading && <div className="mt-6 text-sm text-muted">Loading…</div>}
      {error && <div className="mt-6 text-sm text-rose-700">Could not load events. Is the pact_events table created?</div>}

      {!isLoading && events.length === 0 && (
        <div className="mt-6 rounded-card bg-white shadow-card p-8 text-center text-muted text-sm">
          No events yet. Once PACT posts to the webhook, they’ll appear here.
        </div>
      )}

      {events.length > 0 && (
        <div className="mt-6 rounded-card bg-white shadow-card overflow-hidden border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Received</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Voucher</th>
                <th className="px-3 py-2">Auth</th>
                <th className="px-3 py-2">Note</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {events.map((e) => (
                <Fragment key={e.id}>
                  <tr className="hover:bg-canvas/50">
                    <td className="px-3 py-2 num text-muted">{e.id}</td>
                    <td className="px-3 py-2 num">{fmt(e.received_at)}</td>
                    <td className="px-3 py-2 font-semibold">{e.event ?? "—"}</td>
                    <td className="px-3 py-2 num">{e.voucher_no ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={e.token_ok ? "text-emerald-700" : "text-rose-700"}>
                        {e.token_ok ? "✓ ok" : "✗ rejected"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">{e.note ?? ""}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => setOpenId(openId === e.id ? null : e.id)}
                        className="text-xs text-muted hover:text-ink underline">
                        {openId === e.id ? "hide" : "payload"}
                      </button>
                    </td>
                  </tr>
                  {openId === e.id && (
                    <tr>
                      <td colSpan={7} className="px-3 py-2 bg-canvas">
                        <pre className="text-[11px] whitespace-pre-wrap break-all num">
                          {JSON.stringify(e.raw, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
