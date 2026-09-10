"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/apiClient";
import StatusBadge from "@/components/StatusBadge";

type Order = {
  id: string;
  customerName: string;
  customerPhone: string;
  status: string;
  totalAmount: number;
  notes: string | null;
  createdAt: string;
  items: Array<{ itemName: string; itemPrice: number; quantity: number }>;
};

const STATUSES = ["pending", "accepted", "ready", "completed", "cancelled"];

export default function OrdersTab() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api<Order[]>("/api/dashboard/orders").then(setOrders).catch((e) => setError(errorMessage(e)));
  }

  useEffect(load, []);

  async function updateStatus(id: string, status: string) {
    try {
      await api(`/api/dashboard/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (!orders) return <p className="text-stone-500">Loading…</p>;

  return (
    <div className="space-y-3">
      {orders.map((o) => (
        <div key={o.id} className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium text-stone-900">{o.customerName}</p>
              <p className="text-xs text-stone-400">{o.customerPhone}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={o.status} />
              <select
                value={o.status}
                onChange={(e) => updateStatus(o.id, e.target.value)}
                className="rounded-md border border-stone-300 px-2 py-1 text-xs"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-2 divide-y divide-stone-100 text-sm">
            {o.items.map((it, idx) => (
              <div key={idx} className="flex justify-between py-1">
                <span>
                  {it.quantity}x {it.itemName}
                </span>
                <span>{(it.itemPrice * it.quantity).toFixed(2)} ETB</span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-sm font-semibold">
            <span>Total</span>
            <span>{o.totalAmount.toFixed(2)} ETB</span>
          </div>
          {o.notes && <p className="mt-1 text-xs text-stone-500">Note: {o.notes}</p>}
        </div>
      ))}
      {orders.length === 0 && <p className="text-stone-400">No orders yet.</p>}
    </div>
  );
}
