"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";

type TeamUser = { id: string; email: string; created_at: string; last_sign_in_at: string | null };

export default function TeamPage() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/team", { cache: "no-store" });
    const j = await r.json();
    setLoading(false);
    if (!r.ok) return toast.error(j?.error || "Could not load users.");
    setUsers(j.users || []);
  }

  useEffect(() => { load(); }, []);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    const r = await fetch("/api/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    const j = await r.json();
    setAdding(false);
    if (!r.ok) return toast.error(j?.error || "Could not add user.");
    toast.success(`Added ${j.email}`);
    setEmail(""); setPassword("");
    load();
  }

  async function removeUser(u: TeamUser) {
    if (!confirm(`Remove ${u.email}? They will lose access immediately.`)) return;
    const r = await fetch(`/api/team?id=${encodeURIComponent(u.id)}`, { method: "DELETE" });
    const j = await r.json();
    if (!r.ok) return toast.error(j?.error || "Could not remove user.");
    toast.success(`Removed ${u.email}`);
    load();
  }

  return (
    <>
      <PageHeader title="Team" subtitle="People who can sign in to the platform" />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] items-start">
        <div className="rounded-card bg-white shadow-card overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted">Loading…</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">No users yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-line">
                  <th className="px-4 py-2 font-medium">Email</th>
                  <th className="px-4 py-2 font-medium">Last sign-in</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 text-ink">{u.email}</td>
                    <td className="px-4 py-2.5 text-muted">{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "never"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => removeUser(u)} className="text-muted hover:text-danger-600 p-1" title="Remove user">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <form onSubmit={addUser} className="rounded-card bg-white shadow-card p-5 space-y-3">
          <div className="font-medium text-ink">Add a team member</div>
          <div>
            <label className="block text-sm text-muted mb-1">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-btn border border-line px-3 py-2 text-sm focus-ring" placeholder="name@nutriobox.com" />
          </div>
          <div>
            <label className="block text-sm text-muted mb-1">Temporary password</label>
            <input type="text" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-btn border border-line px-3 py-2 text-sm focus-ring" placeholder="At least 6 characters" />
          </div>
          <button type="submit" disabled={adding}
            className="w-full rounded-btn bg-brand-600 text-white py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-60">
            {adding ? "Adding…" : "Add member"}
          </button>
          <p className="text-xs text-muted">They sign in with this email and password, and can change it later under Account settings.</p>
        </form>
      </div>
    </>
  );
}
