"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Login failed.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function fill(demoEmail: string) {
    setEmail(demoEmail);
    setPassword("appyra123");
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-xl font-semibold text-stone-900">Staff login</h1>
      <p className="mt-1 text-sm text-stone-600">Restaurant staff accounts are founder-managed in V1 — no self-signup.</p>

      <form onSubmit={submit} className="mt-6 rounded-lg border border-stone-200 bg-white p-5">
        <label className="block text-sm text-stone-600">
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" />
        </label>
        <label className="mt-3 block text-sm text-stone-600">
          Password
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" />
        </label>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={submitting} className="mt-4 w-full rounded-md bg-amber-800 px-4 py-2 text-sm font-medium text-white hover:bg-amber-900 disabled:opacity-50">
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="mt-4 rounded-lg border border-dashed border-stone-300 p-4 text-xs text-stone-500">
        <p className="font-medium text-stone-600">Demo accounts (seeded):</p>
        <button type="button" onClick={() => fill("staff@habeshakitchen.et")} className="mt-2 block text-amber-800 hover:underline">
          staff@habeshakitchen.et
        </button>
        <button type="button" onClick={() => fill("staff@addiscafe.et")} className="mt-1 block text-amber-800 hover:underline">
          staff@addiscafe.et
        </button>
        <p className="mt-2">Password for both: appyra123</p>
      </div>
    </div>
  );
}
