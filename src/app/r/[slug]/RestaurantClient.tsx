"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PublicMenuCategory, PublicRestaurant } from "@/lib/types";

type CartLine = { itemId: string; name: string; price: number; quantity: number };

const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const DAY_LABEL: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

export default function RestaurantClient({ restaurant, menu }: { restaurant: PublicRestaurant; menu: PublicMenuCategory[] }) {
  const [tab, setTab] = useState<"order" | "reserve">("order");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-stone-900">{restaurant.name}</h1>
            {restaurant.description && <p className="mt-1 text-stone-600">{restaurant.description}</p>}
            {restaurant.phone && <p className="mt-1 text-sm text-stone-400">{restaurant.phone}</p>}
          </div>
          {restaurant.isTemporarilyClosed && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              Temporarily closed{restaurant.temporaryClosureNote ? `: ${restaurant.temporaryClosureNote}` : ""}
            </div>
          )}
        </div>
        {restaurant.hours && (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
            {DAY_ORDER.map((d) =>
              restaurant.hours?.[d] ? (
                <span key={d}>
                  <span className="font-medium text-stone-600">{DAY_LABEL[d]}</span> {restaurant.hours[d].open}–{restaurant.hours[d].close}
                </span>
              ) : null
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-2 border-b border-stone-200">
        <button
          onClick={() => setTab("order")}
          className={`px-4 py-2 text-sm font-medium ${tab === "order" ? "border-b-2 border-amber-800 text-amber-800" : "text-stone-500 hover:text-stone-800"}`}
        >
          Order
        </button>
        <button
          onClick={() => setTab("reserve")}
          className={`px-4 py-2 text-sm font-medium ${tab === "reserve" ? "border-b-2 border-amber-800 text-amber-800" : "text-stone-500 hover:text-stone-800"}`}
        >
          Reserve a table
        </button>
      </div>

      <div className="mt-6">{tab === "order" ? <OrderPanel restaurant={restaurant} menu={menu} /> : <ReservationPanel restaurant={restaurant} />}</div>
    </div>
  );
}

function OrderPanel({ restaurant, menu }: { restaurant: PublicRestaurant; menu: PublicMenuCategory[] }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ id: string; totalAmount: number } | null>(null);

  const total = useMemo(() => cart.reduce((sum, l) => sum + l.price * l.quantity, 0), [cart]);

  function addItem(itemId: string, name: string, price: number) {
    setCart((prev) => {
      const existing = prev.find((l) => l.itemId === itemId);
      if (existing) return prev.map((l) => (l.itemId === itemId ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { itemId, name, price, quantity: 1 }];
    });
  }

  function setQuantity(itemId: string, quantity: number) {
    setCart((prev) => (quantity <= 0 ? prev.filter((l) => l.itemId !== itemId) : prev.map((l) => (l.itemId === itemId ? { ...l, quantity } : l))));
  }

  async function placeOrder() {
    setError(null);
    if (cart.length === 0) return setError("Add at least one item to your cart.");
    if (!customerName.trim() || !customerPhone.trim()) return setError("Name and phone are required.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          items: cart.map((l) => ({ menu_item_id: l.itemId, quantity: l.quantity })),
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Something went wrong placing your order.");
        return;
      }
      setConfirmed({ id: data.id, totalAmount: data.total_amount });
      setCart([]);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
        <h2 className="text-lg font-semibold text-green-900">Order placed!</h2>
        <p className="mt-1 text-green-800">Total: {confirmed.totalAmount.toFixed(2)} ETB — pay at pickup.</p>
        <p className="mt-1 text-sm text-green-700">Order ID: {confirmed.id}</p>
        <Link href={`/guest/orders/${confirmed.id}`} className="mt-4 inline-block rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800">
          Track this order
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {menu.map((category) => (
          <div key={category.id}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">{category.name}</h3>
            <div className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
              {category.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="font-medium text-stone-900">{item.name}</p>
                    {item.description && <p className="text-sm text-stone-500">{item.description}</p>}
                    <p className="mt-1 text-sm text-stone-700">{item.price.toFixed(2)} ETB</p>
                  </div>
                  {item.isAvailable ? (
                    <button
                      onClick={() => addItem(item.id, item.name, item.price)}
                      className="shrink-0 rounded-md border border-amber-800 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-50"
                    >
                      Add
                    </button>
                  ) : (
                    <span className="shrink-0 text-xs font-medium text-stone-400">Unavailable</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {menu.length === 0 && <p className="text-stone-500">No menu items yet.</p>}
      </div>

      <div className="h-fit rounded-lg border border-stone-200 bg-white p-4">
        <h3 className="font-semibold text-stone-900">Your order</h3>
        {cart.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">Cart is empty.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {cart.map((line) => (
              <div key={line.itemId} className="flex items-center justify-between gap-2 text-sm">
                <span className="flex-1">{line.name}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setQuantity(line.itemId, line.quantity - 1)} className="h-6 w-6 rounded border border-stone-300 text-stone-600">
                    −
                  </button>
                  <span className="w-5 text-center">{line.quantity}</span>
                  <button onClick={() => setQuantity(line.itemId, line.quantity + 1)} className="h-6 w-6 rounded border border-stone-300 text-stone-600">
                    +
                  </button>
                </div>
                <span className="w-16 text-right">{(line.price * line.quantity).toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-stone-200 pt-2 text-sm font-semibold">
              <span>Total</span>
              <span>{total.toFixed(2)} ETB</span>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-2">
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Your name" className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm" />
          <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Phone number" className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm" />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm" rows={2} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={placeOrder}
            disabled={submitting || restaurant.isTemporarilyClosed}
            className="w-full rounded-md bg-amber-800 px-4 py-2 text-sm font-medium text-white hover:bg-amber-900 disabled:opacity-50"
          >
            {submitting ? "Placing order…" : "Place order — pay at pickup"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReservationPanel({ restaurant }: { restaurant: PublicRestaurant }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [guestCount, setGuestCount] = useState(2);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ id: string } | null>(null);

  async function submitReservation() {
    setError(null);
    if (!date || !time || !customerName.trim() || !customerPhone.trim()) return setError("Date, time, name, and phone are required.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          reservation_date: date,
          reservation_time: time,
          guest_count: guestCount,
          notes: notes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Something went wrong booking your table.");
        return;
      }
      setConfirmed({ id: data.id });
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
        <h2 className="text-lg font-semibold text-green-900">Reservation requested!</h2>
        <p className="mt-1 text-sm text-green-700">The restaurant will confirm it shortly. Reservation ID: {confirmed.id}</p>
        <Link href={`/guest/reservations/${confirmed.id}`} className="mt-4 inline-block rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800">
          Track this reservation
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md rounded-lg border border-stone-200 bg-white p-6">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm text-stone-600">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" />
        </label>
        <label className="text-sm text-stone-600">
          Time
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" />
        </label>
      </div>
      <label className="mt-3 block text-sm text-stone-600">
        Guests
        <input
          type="number"
          min={1}
          value={guestCount}
          onChange={(e) => setGuestCount(parseInt(e.target.value, 10) || 1)}
          className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="mt-3 block text-sm text-stone-600">
        Name
        <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" />
      </label>
      <label className="mt-3 block text-sm text-stone-600">
        Phone
        <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" />
      </label>
      <label className="mt-3 block text-sm text-stone-600">
        Notes (optional)
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm" />
      </label>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button
        onClick={submitReservation}
        disabled={submitting || restaurant.isTemporarilyClosed}
        className="mt-4 w-full rounded-md bg-amber-800 px-4 py-2 text-sm font-medium text-white hover:bg-amber-900 disabled:opacity-50"
      >
        {submitting ? "Booking…" : "Request reservation"}
      </button>
    </div>
  );
}
