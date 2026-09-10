"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GuestLookupPage() {
  const [type, setType] = useState<"orders" | "reservations">("orders");
  const [id, setId] = useState("");
  const router = useRouter();

  function go() {
    if (!id.trim()) return;
    router.push(`/guest/${type}/${id.trim()}`);
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-xl font-semibold text-stone-900">Check your order or reservation</h1>
      <p className="mt-1 text-sm text-stone-600">Paste the confirmation ID you were given after checkout.</p>

      <div className="mt-6 rounded-lg border border-stone-200 bg-white p-5">
        <div className="flex gap-2 text-sm">
          <button
            onClick={() => setType("orders")}
            className={`flex-1 rounded-md border px-3 py-2 ${type === "orders" ? "border-amber-800 bg-amber-50 text-amber-900" : "border-stone-300 text-stone-600"}`}
          >
            Order
          </button>
          <button
            onClick={() => setType("reservations")}
            className={`flex-1 rounded-md border px-3 py-2 ${type === "reservations" ? "border-amber-800 bg-amber-50 text-amber-900" : "border-stone-300 text-stone-600"}`}
          >
            Reservation
          </button>
        </div>
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="Confirmation ID"
          className="mt-4 w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
        />
        <button onClick={go} className="mt-3 w-full rounded-md bg-amber-800 px-4 py-2 text-sm font-medium text-white hover:bg-amber-900">
          Look up
        </button>
      </div>
    </div>
  );
}
