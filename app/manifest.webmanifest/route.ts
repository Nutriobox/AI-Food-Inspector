import { headers } from "next/headers";

// Served per-host so the two domains install as two DISTINCT Android apps.
// A static public/manifest.webmanifest cannot do this - both apps would land on
// the home screen with the same name and icon and staff could not tell them apart.
export const dynamic = "force-dynamic";

export function GET() {
  const host = (headers().get("host") || "").toLowerCase();
  const isKds = host.startsWith("kds.");

  const manifest = isKds
    ? {
        id: "/kds",
        name: "NutrioBox KDS",
        short_name: "KDS",
        description: "Live kitchen order queue for NutrioBox outlets.",
        start_url: "/orders/live", // outlet staff want the queue, not the dashboard
      }
    : {
        id: "/inspector",
        name: "NutrioBox Food Inspector",
        short_name: "Inspector",
        description: "AI food quality inspection for NutrioBox outlets.",
        start_url: "/",
      };

  return Response.json(
    {
      ...manifest,
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#1E4221",
      icons: [
        { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
