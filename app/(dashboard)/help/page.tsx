import { PageHeader } from "@/components/page-header";

export default function HelpPage() {
  return (
    <>
      <PageHeader title="Help & docs" subtitle="How the Food Quality Platform works" />
      <div className="max-w-3xl space-y-4">
        {[
          { h: "Analytics", b: "Overview dashboards: evaluation scores, dish performance, manager activity and order issues across all 10 outlets." },
          { h: "Configuration", b: "Set up each dish: reference photo, description, AI food criteria, expected weight and benchmarks. A dish is 'configured' once it has both an image and a description." },
          { h: "KDS (Kitchen Display)", b: "The in-outlet screen. Staff see live orders, tap the camera on an item to capture its photo, and the AI scores it against the dish's criteria along with weight and temperature checks." },
          { h: "AI Test", b: "A bench to try the AI scoring on any dish + photo without affecting live orders." },
          { h: "Live orders (Petpooja)", b: "Orders flow in automatically from Petpooja via a secure webhook. Every incoming order is logged for verification." },
          { h: "Adding team members", b: "Account creation is admin-only. In Supabase → Authentication → Users → Add user, enter an email and password. You can also add users from the Team page here." },
          { h: "The KDS machine", b: "Open kds.nutriobox.com on the machine. It runs in a locked Kitchen-Display-only mode and stays signed in once you log in." },
        ].map((s) => (
          <div key={s.h} className="rounded-card bg-white shadow-card p-5">
            <div className="font-semibold text-ink mb-1">{s.h}</div>
            <p className="text-sm text-muted leading-relaxed">{s.b}</p>
          </div>
        ))}
        <div className="rounded-card bg-white shadow-card p-5">
          <div className="font-semibold text-ink mb-1">Need more help?</div>
          <p className="text-sm text-muted">Contact your platform administrator at admin@nutriobox.com.</p>
        </div>
      </div>
    </>
  );
}
