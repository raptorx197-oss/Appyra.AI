import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getStaffSession } from "@/lib/auth";

// Mirrors the RLS policy "staff can view own restaurant reservations" —
// scoped to session.restaurantId, never a client-supplied restaurant id.
export async function GET() {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: { code: "unauthorized", message: "Not signed in." } }, { status: 401 });

  const db = getDb();
  const rows = db
    .prepare(
      `select id, customer_name as customerName, customer_phone as customerPhone, reservation_date as reservationDate,
              reservation_time as reservationTime, guest_count as guestCount, status, notes, created_at as createdAt
       from reservations where restaurant_id = ? order by created_at desc`
    )
    .all(session.restaurantId);

  return NextResponse.json(rows);
}
