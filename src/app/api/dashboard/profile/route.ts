import { NextResponse } from "next/server";
import { getDb, nowIso } from "@/lib/db";
import { getStaffSession } from "@/lib/auth";

export async function GET() {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: { code: "unauthorized", message: "Not signed in." } }, { status: 401 });

  const db = getDb();
  const row = db
    .prepare(
      `select name, description, phone, hours, is_temporarily_closed as isTemporarilyClosed, temporary_closure_note as temporaryClosureNote
       from restaurants where id = ?`
    )
    .get(session.restaurantId) as {
    name: string; description: string | null; phone: string | null; hours: string | null; isTemporarilyClosed: number; temporaryClosureNote: string | null;
  };

  return NextResponse.json({ ...row, hours: row.hours ? JSON.parse(row.hours) : null, isTemporarilyClosed: !!row.isTemporarilyClosed });
}

export async function PATCH(request: Request) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: { code: "unauthorized", message: "Not signed in." } }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: { code: "invalid_json", message: "Request body must be JSON." } }, { status: 400 });

  const db = getDb();
  const existing = db
    .prepare(`select description, phone, hours, is_temporarily_closed as isTemporarilyClosed, temporary_closure_note as temporaryClosureNote from restaurants where id = ?`)
    .get(session.restaurantId) as { description: string | null; phone: string | null; hours: string | null; isTemporarilyClosed: number; temporaryClosureNote: string | null };

  const description = body.description !== undefined ? body.description : existing.description;
  const phone = body.phone !== undefined ? body.phone : existing.phone;
  const hours = body.hours !== undefined ? JSON.stringify(body.hours) : existing.hours;
  const isTemporarilyClosed = body.isTemporarilyClosed !== undefined ? !!body.isTemporarilyClosed : !!existing.isTemporarilyClosed;
  const temporaryClosureNote = body.temporaryClosureNote !== undefined ? body.temporaryClosureNote : existing.temporaryClosureNote;

  db.prepare(
    `update restaurants set description = ?, phone = ?, hours = ?, is_temporarily_closed = ?, temporary_closure_note = ?, updated_at = ? where id = ?`
  ).run(description, phone, hours, isTemporarilyClosed ? 1 : 0, temporaryClosureNote, nowIso(), session.restaurantId);

  return NextResponse.json({ ok: true });
}
