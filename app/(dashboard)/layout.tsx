import { SiteHeader } from "@/components/site-header";
import { FilterProvider } from "@/components/filter-context";
import { KioskController } from "@/components/kiosk-controller";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <FilterProvider>
      <KioskController />
      <SiteHeader />
      <main className="max-w-[1440px] mx-auto px-6 py-6">{children}</main>
    </FilterProvider>
  );
}
