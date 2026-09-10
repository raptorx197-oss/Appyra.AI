import { NextResponse } from "next/server";
import { getDb, uuid, nowIso } from "@/lib/db";
import { getStaffSession } from "@/lib/auth";

export async function POST(request: Request) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: { code: "unauthorized", message: "Not signed in." } }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: { code: "missing_field", message: "name is required." } }, { status: 400 });
  }

  const db = getDb();
  const menu = db.prepare(`select id from menus where restaurant_id = ?`).get(session.restaurantId) as { id: string } | undefined;
  if (!menu) return NextResponse.json({ error: { code: "no_menu", message: "This restaurant has no menu yet." } }, { status: 500 });

  const maxOrder = db.prepare(`select coalesce(max(display_order), -1) as m from menu_categories where menu_id = ?`).get(menu.id) as { m: number };
  const id = uuid();
  const now = nowIso();
  db.prepare(`insert into menu_categories (id, menu_id, name, display_order, created_at, updated_at) values (?, ?, ?, ?, ?, ?)`).run(
    id, menu.id, body.name.trim(), maxOrder.m + 1, now, now
  );

  return NextResponse.json({ id, name: body.name.trim(), displayOrder: maxOrder.m + 1, items: [] }, { status: 201 });
}
