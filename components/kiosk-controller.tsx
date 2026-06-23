"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { syncKioskFromUrl } from "@/lib/kiosk";

// In kiosk mode, force the machine to stay on the KDS and never reach
// Analytics / Configuration / AI Test.
export function KioskController() {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const kiosk = syncKioskFromUrl();
    if (kiosk && !pathname.startsWith("/orders/live")) {
      router.replace("/orders/live");
    }
  }, [pathname, router]);
  return null;
}
