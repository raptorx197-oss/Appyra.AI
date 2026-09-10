import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getStaffSession } from "@/lib/auth";

export async function GET() {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: { code: "unauthorized", message: "Not signed in." } }, { status: 401 });

  const db = getDb();
  const categories = db
    .prepare(
      `select mc.id, mc.name, mc.display_order as displayOrder from menu_categories mc
       join menus m on m.id = mc.menu_id where m.restaurant_id = ? order by mc.display_order`
    )
    .all(session.restaurantId) as Array<{ id: string; name: string; displayOrder: number }>;

  const itemStmt = db.prepare(
    `select id, name, description, price, is_available as isAvailable, display_order as displayOrder
     from menu_items where category_id = ? order by display_order`
  );

  const result = categories.map((c) => ({
    ...c,
    items: (itemStmt.all(c.id) as Array<{ id: string; name: string; description: string | null; price: number; isAvailable: number; displayOrder: number }>).map(
      (i) => ({ ...i, isAvailable: !!i.isAvailable })
    ),
  }));

  return NextResponse.json(result);
}
