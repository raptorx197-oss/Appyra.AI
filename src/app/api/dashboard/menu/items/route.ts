import { NextResponse } from "next/server";
import { getDb, uuid, nowIso } from "@/lib/db";
import { getStaffSession } from "@/lib/auth";

export async function POST(request: Request) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: { code: "unauthorized", message: "Not signed in." } }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.categoryId || !body?.name?.trim() || typeof body.price !== "number" || body.price < 0) {
    return NextResponse.json({ error: { code: "missing_field", message: "categoryId, name, and a non-negative price are required." } }, { status: 400 });
  }

  const db = getDb();
  const owns = db
    .prepare(`select 1 from menu_categories mc join menus m on m.id = mc.menu_id where mc.id = ? and m.restaurant_id = ?`)
    .get(body.categoryId, session.restaurantId);
  if (!owns) return NextResponse.json({ error: { code: "forbidden", message: "Not your category." } }, { status: 403 });

  const maxOrder = db.prepare(`select coalesce(max(display_order), -1) as m from menu_items where category_id = ?`).get(body.categoryId) as { m: number };
  const id = uuid();
  const now = nowIso();
  db.prepare(
    `insert into menu_items (id, category_id, name, description, price, image_url, is_available, display_order, created_at, updated_at)
     values (?, ?, ?, ?, ?, null, 1, ?, ?, ?)`
  ).run(id, body.categoryId, body.name.trim(), body.description ?? null, body.price, maxOrder.m + 1, now, now);

  return NextResponse.json({ id, name: body.name.trim(), description: body.description ?? null, price: body.price, isAvailable: true }, { status: 201 });
}
