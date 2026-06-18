export default function KdsLayout({ children }: { children: React.ReactNode }) {
  // The parent (dashboard) layout already renders the SiteHeader and <main>.
  // This layout only passes children through to avoid a duplicate header.
  return <>{children}</>;
}
