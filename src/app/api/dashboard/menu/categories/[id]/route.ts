import { NextResponse } from "next/server";
import { getDb, nowIso } from "@/lib/db";
import { getStaffSession } from "@/lib/auth";

function ownsCategory(restaurantId: string, categoryId: string): boolean {
  const db = getDb();
  const row = db
    .prepare(`select 1 from menu_categories mc join menus m on m.id = mc.menu_id where mc.id = ? and m.restaurant_id = ?`)
    .get(categoryId, restaurantId);
  return !!row;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: { code: "unauthorized", message: "Not signed in." } }, { status: 401 });
  const { id } = await params;
  if (!ownsCategory(session.restaurantId, id)) {
    return NextResponse.json({ error: { code: "forbidden", message: "Not your category." } }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.name?.trim()) return NextResponse.json({ error: { code: "missing_field", message: "name is required." } }, { status: 400 });

  getDb().prepare(`update menu_categories set name = ?, updated_at = ? where id = ?`).run(body.name.trim(), nowIso(), id);
  return NextResponse.json({ id, name: body.name.trim() });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: { code: "unauthorized", message: "Not signed in." } }, { status: 401 });
  const { id } = await params;
  if (!ownsCategory(session.restaurantId, id)) {
    return NextResponse.json({ error: { code: "forbidden", message: "Not your category." } }, { status: 403 });
  }

  getDb().prepare(`delete from menu_categories where id = ?`).run(id);
  return NextResponse.json({ ok: true });
}
