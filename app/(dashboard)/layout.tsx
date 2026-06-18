import { SiteHeader } from "@/components/site-header";
import { FilterProvider } from "@/components/filter-context";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <FilterProvider>
      <SiteHeader />
      <main className="max-w-[1440px] mx-auto px-6 py-6">{children}</main>
    </FilterProvider>
  );
}
