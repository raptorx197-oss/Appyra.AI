import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// backend/API.md — GET /api/guest/reservations/:id. Single row by
// unguessable UUID only — no other parameter, no listing, no search.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const row = db
    .prepare(
      `select id, status, reservation_date as reservationDate, reservation_time as reservationTime,
              guest_count as guestCount, restaurant_id as restaurantId
       from reservations where id = ?`
    )
    .get(id);

  if (!row) {
    return NextResponse.json({ error: { code: "not_found", message: "Reservation not found." } }, { status: 404 });
  }
  return NextResponse.json(row);
}
