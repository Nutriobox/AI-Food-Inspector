import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { Toaster } from "sonner";
import { QueryProvider } from "@/components/query-provider";
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
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <QueryProvider>{children}</QueryProvider>
        <Toaster position="bottom-center" richColors />
      </body>
    </html>
  );
}
