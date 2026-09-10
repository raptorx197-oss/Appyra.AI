"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/apiClient";

type Profile = {
  name: string;
  description: string | null;
  phone: string | null;
  hours: Record<string, { open: string; close: string }> | null;
  isTemporarilyClosed: boolean;
  temporaryClosureNote: string | null;
};

export default function ProfileTab() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<Profile>("/api/dashboard/profile").then(setProfile).catch((e) => setError(errorMessage(e)));
  }, []);

  async function save() {
    if (!profile) return;
    setError(null);
    setSaved(false);
    try {
      await api("/api/dashboard/profile", {
        method: "PATCH",
        body: JSON.stringify({
          description: profile.description,
          phone: profile.phone,
          isTemporarilyClosed: profile.isTemporarilyClosed,
          temporaryClosureNote: profile.temporaryClosureNote,
        }),
      });
      setSaved(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (error && !profile) return <p className="text-red-600">{error}</p>;
  if (!profile) return <p className="text-stone-500">Loading…</p>;

  return (
    <div className="max-w-lg rounded-lg border border-stone-200 bg-white p-5">
      <h3 className="font-semibold text-stone-900">{profile.name}</h3>
      <label className="mt-3 block text-sm text-stone-600">
        Description
        <textarea
          value={profile.description ?? ""}
          onChange={(e) => setProfile({ ...profile, description: e.target.value })}
          rows={3}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="mt-3 block text-sm text-stone-600">
        Phone
        <input
          value={profile.phone ?? ""}
          onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="mt-3 flex items-center gap-2 text-sm text-stone-600">
        <input
          type="checkbox"
          checked={profile.isTemporarilyClosed}
          onChange={(e) => setProfile({ ...profile, isTemporarilyClosed: e.target.checked })}
        />
        Temporarily closed
      </label>
      {profile.isTemporarilyClosed && (
        <input
          placeholder="Reason (optional)"
          value={profile.temporaryClosureNote ?? ""}
          onChange={(e) => setProfile({ ...profile, temporaryClosureNote: e.target.value })}
          className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
        />
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {saved && <p className="mt-3 text-sm text-green-700">Saved.</p>}
      <button onClick={save} className="mt-4 rounded-md bg-amber-800 px-4 py-2 text-sm font-medium text-white hover:bg-amber-900">
        Save
      </button>
    </div>
  );
}
