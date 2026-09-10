"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/apiClient";
import StatusBadge from "@/components/StatusBadge";

type Reservation = {
  id: string;
  customerName: string;
  customerPhone: string;
  reservationDate: string;
  reservationTime: string;
  guestCount: number;
  status: string;
  notes: string | null;
  createdAt: string;
};

const STATUSES = ["pending", "confirmed", "cancelled", "no_show", "completed"];

export default function ReservationsTab() {
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api<Reservation[]>("/api/dashboard/reservations").then(setReservations).catch((e) => setError(errorMessage(e)));
  }

  useEffect(load, []);

  async function updateStatus(id: string, status: string) {
    try {
      await api(`/api/dashboard/reservations/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (!reservations) return <p className="text-stone-500">Loading…</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 text-left text-xs uppercase text-stone-500">
          <tr>
            <th className="px-4 py-2">Customer</th>
            <th className="px-4 py-2">Date / Time</th>
            <th className="px-4 py-2">Guests</th>
            <th className="px-4 py-2">Status</th>
            <th className="px-4 py-2">Notes</th>
            <th className="px-4 py-2">Update</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {reservations.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2">
                <div>{r.customerName}</div>
                <div className="text-xs text-stone-400">{r.customerPhone}</div>
              </td>
              <td className="px-4 py-2">
                {r.reservationDate} {r.reservationTime}
              </td>
              <td className="px-4 py-2">{r.guestCount}</td>
              <td className="px-4 py-2">
                <StatusBadge status={r.status} />
              </td>
              <td className="px-4 py-2 text-stone-500">{r.notes ?? "—"}</td>
              <td className="px-4 py-2">
                <select
                  value={r.status}
                  onChange={(e) => updateStatus(r.id, e.target.value)}
                  className="rounded-md border border-stone-300 px-2 py-1 text-xs"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
          {reservations.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-stone-400">
                No reservations yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
