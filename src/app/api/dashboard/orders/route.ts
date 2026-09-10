import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getStaffSession } from "@/lib/auth";

export async function GET() {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: { code: "unauthorized", message: "Not signed in." } }, { status: 401 });

  const db = getDb();
  const orders = db
    .prepare(
      `select id, customer_name as customerName, customer_phone as customerPhone, status, total_amount as totalAmount,
              notes, created_at as createdAt
       from orders where restaurant_id = ? order by created_at desc`
    )
    .all(session.restaurantId) as Array<{ id: string; customerName: string; customerPhone: string; status: string; totalAmount: number; notes: string | null; createdAt: string }>;

  const itemStmt = db.prepare(`select item_name as itemName, item_price as itemPrice, quantity from order_items where order_id = ?`);
  const withItems = orders.map((o) => ({ ...o, items: itemStmt.all(o.id) }));

  return NextResponse.json(withItems);
}
