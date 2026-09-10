import { NextResponse } from "next/server";
import { getDb, nowIso } from "@/lib/db";
import { getStaffSession } from "@/lib/auth";

const VALID_STATUSES = ["pending", "accepted", "ready", "completed", "cancelled"];

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
  const existing = db.prepare(`select restaurant_id as restaurantId, status, notes from orders where id = ?`).get(id) as
    | { restaurantId: string; status: string; notes: string | null }
    | undefined;
  if (!existing) return NextResponse.json({ error: { code: "not_found", message: "Order not found." } }, { status: 404 });
  if (existing.restaurantId !== session.restaurantId) {
    return NextResponse.json({ error: { code: "forbidden", message: "Not your restaurant's order." } }, { status: 403 });
  }

  // total_amount is deliberately never accepted from this route — only the
  // database trigger's own list of mutable columns can change, and this
  // route doesn't even expose the possibility. See prevent_order_immutable_field_changes in src/lib/db.ts.
  const newStatus = body.status ?? existing.status;
  const newNotes = body.notes !== undefined ? body.notes : existing.notes;
  db.prepare(`update orders set status = ?, notes = ?, updated_at = ? where id = ?`).run(newStatus, newNotes, nowIso(), id);

  return NextResponse.json({ id, status: newStatus, notes: newNotes });
}
