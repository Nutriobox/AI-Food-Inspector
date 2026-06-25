"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setError("Incorrect email or password.");
      return;
    }
    router.push("/overview");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-onwhite.png" alt="Nutriobox" className="h-8 w-auto mb-3" />
          <h1 className="text-lg font-semibold text-ink">Food Quality Platform</h1>
          <p className="text-sm text-muted">Sign in to continue</p>
        </div>

        <form onSubmit={onSubmit} className="rounded-card bg-white shadow-card p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Email</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-btn border border-line px-3 py-2 text-sm focus-ring"
              placeholder="you@nutriobox.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-btn border border-line px-3 py-2 text-sm focus-ring"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-danger-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-btn bg-brand-600 text-white py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-xs text-muted mt-4">
          Need access? Ask your administrator to create an account.
        </p>
      </div>
    </div>
  );
}
