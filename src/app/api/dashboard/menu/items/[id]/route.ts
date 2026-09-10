import { NextResponse } from "next/server";
import { getDb, nowIso } from "@/lib/db";
import { getStaffSession } from "@/lib/auth";

function ownsItem(restaurantId: string, itemId: string): boolean {
  const db = getDb();
  const row = db
    .prepare(
      `select 1 from menu_items mi join menu_categories mc on mc.id = mi.category_id join menus m on m.id = mc.menu_id
       where mi.id = ? and m.restaurant_id = ?`
    )
    .get(itemId, restaurantId);
  return !!row;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: { code: "unauthorized", message: "Not signed in." } }, { status: 401 });
  const { id } = await params;
  if (!ownsItem(session.restaurantId, id)) {
    return NextResponse.json({ error: { code: "forbidden", message: "Not your menu item." } }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: { code: "invalid_json", message: "Request body must be JSON." } }, { status: 400 });

  const db = getDb();
  const existing = db
    .prepare(`select name, description, price, is_available as isAvailable from menu_items where id = ?`)
    .get(id) as { name: string; description: string | null; price: number; isAvailable: number };

  const name = body.name !== undefined ? String(body.name).trim() : existing.name;
  const description = body.description !== undefined ? body.description : existing.description;
  const price = body.price !== undefined ? Number(body.price) : existing.price;
  const isAvailable = body.isAvailable !== undefined ? !!body.isAvailable : !!existing.isAvailable;

  if (!name || Number.isNaN(price) || price < 0) {
    return NextResponse.json({ error: { code: "invalid_field", message: "name and a non-negative price are required." } }, { status: 400 });
  }

  db.prepare(`update menu_items set name = ?, description = ?, price = ?, is_available = ?, updated_at = ? where id = ?`).run(
    name, description, price, isAvailable ? 1 : 0, nowIso(), id
  );

  return NextResponse.json({ id, name, description, price, isAvailable });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: { code: "unauthorized", message: "Not signed in." } }, { status: 401 });
  const { id } = await params;
  if (!ownsItem(session.restaurantId, id)) {
    return NextResponse.json({ error: { code: "forbidden", message: "Not your menu item." } }, { status: 403 });
  }

  getDb().prepare(`delete from menu_items where id = ?`).run(id);
  return NextResponse.json({ ok: true });
}
