"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/page-header";

export default function AccountPage() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 6) return toast.error("Password must be at least 6 characters.");
    if (pw !== pw2) return toast.error("Passwords do not match.");
    setSaving(true);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setSaving(false);
    if (error) return toast.error(error.message);
    setPw(""); setPw2("");
    toast.success("Password updated.");
  }

  return (
    <>
      <PageHeader title="Account settings" subtitle="Manage your own account" />
      <div className="max-w-lg space-y-6">
        <div className="rounded-card bg-white shadow-card p-6">
          <div className="text-sm text-muted mb-1">Signed in as</div>
          <div className="text-base font-medium text-ink">{email || "…"}</div>
        </div>

        <form onSubmit={changePassword} className="rounded-card bg-white shadow-card p-6 space-y-4">
          <div className="font-medium text-ink">Change password</div>
          <div>
            <label className="block text-sm text-muted mb-1">New password</label>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
              className="w-full rounded-btn border border-line px-3 py-2 text-sm focus-ring" placeholder="At least 6 characters" />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Confirm new password</label>
            <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)}
              className="w-full rounded-btn border border-line px-3 py-2 text-sm focus-ring" placeholder="Re-enter password" />
          </div>
          <button type="submit" disabled={saving}
            className="rounded-btn bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-60">
            {saving ? "Saving…" : "Update password"}
          </button>
        </form>
      </div>
    </>
  );
}
