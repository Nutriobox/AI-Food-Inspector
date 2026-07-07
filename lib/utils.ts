import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Return an optimized, width-capped Cloudinary delivery URL.
 * Full-size originals (often 1-3 MB) can stall on weak connections and render
 * only partially; this asks Cloudinary for an auto-format, auto-quality,
 * width-limited version (typically ~50-100 KB) so it loads reliably on the
 * hardware machine. Non-Cloudinary URLs (data:, local paths) and URLs that
 * already carry a transformation are returned unchanged.
 */
export function cldThumb(url?: string | null, width = 800): string {
  if (!url) return url ?? "";
  const marker = "/image/upload/";
  const i = url.indexOf(marker);
  if (i === -1) return url;
  const rest = url.slice(i + marker.length);
  if (/^[a-z]{1,3}_[a-z0-9]/i.test(rest)) return url; // already transformed
  return url.slice(0, i + marker.length) + `f_auto,q_auto,w_${width},c_limit/` + rest;
}
