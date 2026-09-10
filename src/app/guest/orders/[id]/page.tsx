import { notFound } from "next/navigation";
import Link from "next/link";
import { getDb } from "@/lib/db";
import { getRestaurantById } from "@/lib/queries";
import { OrderStatus } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";

export default async function GuestOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const order = db
    .prepare(`select id, status, total_amount as totalAmount, restaurant_id as restaurantId, created_at as createdAt from orders where id = ?`)
    .get(id) as { id: string; status: OrderStatus; totalAmount: number; restaurantId: string; createdAt: string } | undefined;

  if (!order) notFound();

  const items = db
    .prepare(`select item_name as itemName, item_price as itemPrice, quantity from order_items where order_id = ?`)
    .all(id) as Array<{ itemName: string; itemPrice: number; quantity: number }>;
  const restaurant = getRestaurantById(order.restaurantId);

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Link href="/guest" className="text-sm text-amber-800 hover:underline">
        &larr; Look up another
      </Link>
      <div className="mt-4 rounded-lg border border-stone-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-stone-900">Order status</h1>
          <StatusBadge status={order.status} />
        </div>
        {restaurant && <p className="mt-1 text-sm text-stone-500">{restaurant.name}</p>}
        <div className="mt-4 divide-y divide-stone-100 text-sm">
          {items.map((it, idx) => (
            <div key={idx} className="flex justify-between py-1.5">
              <span>
                {it.quantity}x {it.itemName}
              </span>
              <span>{(it.itemPrice * it.quantity).toFixed(2)} ETB</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between border-t border-stone-200 pt-2 text-sm font-semibold">
          <span>Total (pay at pickup)</span>
          <span>{order.totalAmount.toFixed(2)} ETB</span>
        </div>
        <p className="mt-4 text-xs text-stone-400">Order ID: {order.id}</p>
      </div>
    </div>
  );
}
