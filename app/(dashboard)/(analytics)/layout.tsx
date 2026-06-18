import { FilterBar } from "@/components/filter-bar";
import { AnalyticsTabs } from "@/components/analytics-tabs";

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FilterBar />
      <AnalyticsTabs />
      {children}
    </>
  );
}
