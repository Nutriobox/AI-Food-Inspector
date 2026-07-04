// Lightweight per-IP fixed-window rate limiter backed by Postgres.
//
// Why Postgres and not an in-memory counter: on Vercel each request can run on a
// different serverless instance, so an in-memory Map would reset constantly and
// never actually limit anything. A shared table works across all instances.
//
// It FAILS OPEN: if the database is briefly unavailable the request is allowed
// through, so the limiter can never take the whole app down.
import { q } from "@/db/client";

/** Best-effort client IP from the standard proxy headers. */
export function clientIp(req: Request): string {
  const h = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "").split(",")[0].trim();
  return h || "unknown";
}

/**
 * Count this hit against `name` for `ip` within a fixed window.
 * @returns ok=false once the window count exceeds `limit`.
 */
export async function rateLimit(
  name: string,
  ip: string,
  limit: number,
  windowSec: number
): Promise<{ ok: boolean; count: number; limit: number }> {
  const now = Date.now();
  const windowIndex = Math.floor(now / (windowSec * 1000));
  const bucket = `${name}:${ip}:${windowIndex}`;
  const expires = new Date((windowIndex + 1) * windowSec * 1000).toISOString();
  try {
    const rows = await q<{ count: number }>(
      `INSERT INTO rate_limits (bucket, count, expires_at) VALUES (?, 1, ?)
       ON CONFLICT (bucket) DO UPDATE SET count = rate_limits.count + 1
       RETURNING count`,
      [bucket, expires]
    );
    const count = rows[0]?.count ?? 1;
    // Opportunistic cleanup of stale buckets (~2% of calls) so the table stays small.
    if (Math.random() < 0.02) {
      try { await q(`DELETE FROM rate_limits WHERE expires_at < now()`, []); } catch { /* ignore */ }
    }
    return { ok: count <= limit, count, limit };
  } catch {
    return { ok: true, count: 0, limit }; // fail open
  }
}
