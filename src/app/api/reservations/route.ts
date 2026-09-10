import { NextResponse } from "next/server";
import { getDb, uuid, nowIso } from "@/lib/db";

// Matches backend/API.md — reservations carry no pricing data, so a direct
// (server-mediated, since we have no Supabase client SDK here) insert is
// safe and simple, unlike order creation.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: { code: "invalid_json", message: "Request body must be JSON." } }, { status: 400 });
  }

  const { restaurant_id, customer_name, customer_phone, reservation_date, reservation_time, guest_count, notes } = body;

  if (!restaurant_id || !customer_name?.trim() || !customer_phone?.trim() || !reservation_date || !reservation_time) {
    return NextResponse.json(
      { error: { code: "missing_field", message: "restaurant_id, customer_name, customer_phone, reservation_date, and reservation_time are required." } },
      { status: 400 }
    );
  }
  if (!Number.isInteger(guest_count) || guest_count <= 0) {
    return NextResponse.json({ error: { code: "invalid_guest_count", message: "guest_count must be a positive integer." } }, { status: 400 });
  }

  const db = getDb();
  const restaurant = db.prepare(`select is_active as isActive from restaurants where id = ?`).get(restaurant_id) as { isActive: number } | undefined;
  if (!restaurant || !restaurant.isActive) {
    return NextResponse.json({ error: { code: "restaurant_not_found", message: "Restaurant not found." } }, { status: 404 });
  }

  const now = nowIso();
  const id = uuid();
  db.prepare(
    `insert into reservations (id, restaurant_id, customer_profile_id, customer_name, customer_phone, reservation_date, reservation_time, guest_count, status, notes, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
  ).run(id, restaurant_id, body.customer_profile_id ?? null, customer_name.trim(), customer_phone.trim(), reservation_date, reservation_time, guest_count, notes ?? null, now, now);

  return NextResponse.json(
    { id, restaurant_id, status: "pending", reservation_date, reservation_time, guest_count, created_at: now },
    { status: 201 }
  );
}
