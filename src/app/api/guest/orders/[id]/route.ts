import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// backend/API.md — GET /api/guest/orders/:id. Same single-row-by-ID-only
// pattern as the reservations guest lookup.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const order = db
    .prepare(`select id, status, total_amount as totalAmount, restaurant_id as restaurantId, created_at as createdAt from orders where id = ?`)
    .get(id) as { id: string; status: string; totalAmount: number; restaurantId: string; createdAt: string } | undefined;

  if (!order) {
    return NextResponse.json({ error: { code: "not_found", message: "Order not found." } }, { status: 404 });
  }

  const items = db
    .prepare(`select item_name as itemName, item_price as itemPrice, quantity from order_items where order_id = ?`)
    .all(id);

  return NextResponse.json({ ...order, items });
}
