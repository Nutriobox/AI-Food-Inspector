import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { Toaster } from "sonner";
import { QueryProvider } from "@/components/query-provider";
import { PWA } from "@/components/pwa";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export function generateMetadata(): Metadata {
  const host = (headers().get("host") || "").toLowerCase();
  const isKds = host.startsWith("kds.");
  return {
    title: isKds ? "KDS" : "AI Food Inspector",
    description: "NutrioBox : Healthy, Tasty & Organic Food Cafes in Delhi NCR",
    manifest: "/manifest.webmanifest",
    // Installed-to-home-screen behaviour on Android/iOS.
    appleWebApp: { capable: true, statusBarStyle: "default", title: isKds ? "NutrioBox KDS" : "NutrioBox" },
    icons: { icon: "/icon.png", apple: "/icon.png" },
  };
}

// Phones are the primary device now: fit the notch, keep the brand colour in the
// system bar. Zoom is deliberately left enabled so staff can pinch into a photo.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1E4221",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <QueryProvider>{children}</QueryProvider>
        <Toaster position="bottom-center" richColors />
        <PWA />
      </body>
    </html>
  );
}
