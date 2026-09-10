import { NextResponse } from "next/server";
import { getDb, nowIso } from "@/lib/db";
import { getStaffSession } from "@/lib/auth";

const VALID_STATUSES = ["pending", "confirmed", "cancelled", "no_show", "completed"];

// Only status and notes may change — the same restriction schema.sql's
// prevent_reservation_immutable_field_changes trigger enforces at the
// database layer (see src/lib/db.ts). This route can't accidentally widen
// that even if a bug crept in here, since the trigger is the backstop.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: { code: "unauthorized", message: "Not signed in." } }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body || (body.status === undefined && body.notes === undefined)) {
    return NextResponse.json({ error: { code: "no_fields", message: "Provide status and/or notes." } }, { status: 400 });
  }
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: { code: "invalid_status", message: `status must be one of ${VALID_STATUSES.join(", ")}.` } }, { status: 400 });
  }

  const db = getDb();
  const existing = db.prepare(`select restaurant_id as restaurantId, status, notes from reservations where id = ?`).get(id) as
    | { restaurantId: string; status: string; notes: string | null }
    | undefined;
  if (!existing) return NextResponse.json({ error: { code: "not_found", message: "Reservation not found." } }, { status: 404 });
  if (existing.restaurantId !== session.restaurantId) {
    return NextResponse.json({ error: { code: "forbidden", message: "Not your restaurant's reservation." } }, { status: 403 });
  }

  const newStatus = body.status ?? existing.status;
  const newNotes = body.notes !== undefined ? body.notes : existing.notes;
  db.prepare(`update reservations set status = ?, notes = ?, updated_at = ? where id = ?`).run(newStatus, newNotes, nowIso(), id);

  return NextResponse.json({ id, status: newStatus, notes: newNotes });
}
