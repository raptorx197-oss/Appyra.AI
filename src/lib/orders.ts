import { getDb, uuid, nowIso } from "./db";

// ----------------------------------------------------------------------------
// Implements backend/API.md — "POST /api/orders — the one real custom
// endpoint". The client sends menu_item_id + quantity only, never a price;
// this is the sole place order rows are ever written, and it's the only
// place that's trusted to state what something costs.
// ----------------------------------------------------------------------------

export type CreateOrderInput = {
  restaurant_id: string;
  customer_name: string;
  customer_phone: string;
  customer_profile_id?: string | null;
  items: Array<{ menu_item_id: string; quantity: number }>;
  notes?: string | null;
};

export type ApiError = { status: number; code: string; message: string };

export type CreatedOrder = {
  id: string;
  restaurant_id: string;
  status: string;
  total_amount: number;
  items: Array<{ item_name: string; item_price: number; quantity: number }>;
  created_at: string;
};

export function createGuestOrder(input: CreateOrderInput): { ok: true; order: CreatedOrder } | { ok: false; error: ApiError } {
  if (!input.restaurant_id || !input.customer_name?.trim() || !input.customer_phone?.trim()) {
    return { ok: false, error: { status: 400, code: "missing_field", message: "restaurant_id, customer_name, and customer_phone are required." } };
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, error: { status: 400, code: "empty_cart", message: "At least one item is required." } };
  }

  const db = getDb();
  const restaurant = db.prepare(`select is_active as isActive from restaurants where id = ?`).get(input.restaurant_id) as
    | { isActive: number }
    | undefined;
  if (!restaurant || !restaurant.isActive) {
    return { ok: false, error: { status: 404, code: "restaurant_not_found", message: "Restaurant not found." } };
  }

  const itemStmt = db.prepare(
    `select mi.id, mi.name, mi.price, mi.is_available as isAvailable
     from menu_items mi
     join menu_categories mc on mc.id = mi.category_id
     join menus m on m.id = mc.menu_id
     where mi.id = ? and m.restaurant_id = ?`
  );

  const lines: Array<{ id: string; name: string; price: number; quantity: number }> = [];
  for (const item of input.items) {
    if (!item.menu_item_id || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      return { ok: false, error: { status: 400, code: "invalid_item", message: "Each item needs a menu_item_id and a positive integer quantity." } };
    }
    const row = itemStmt.get(item.menu_item_id, input.restaurant_id) as { id: string; name: string; price: number; isAvailable: number } | undefined;
    if (!row) {
      return { ok: false, error: { status: 400, code: "item_not_found", message: `Item ${item.menu_item_id} is not on this restaurant's menu.` } };
    }
    if (!row.isAvailable) {
      return { ok: false, error: { status: 400, code: "item_unavailable", message: `"${row.name}" is currently unavailable.` } };
    }
    lines.push({ id: row.id, name: row.name, price: row.price, quantity: item.quantity });
  }

  const total = Math.round(lines.reduce((sum, l) => sum + l.price * l.quantity, 0) * 100) / 100;
  const now = nowIso();
  const orderId = uuid();

  db.prepare(
    `insert into orders (id, restaurant_id, customer_profile_id, customer_name, customer_phone, status, total_amount, notes, created_at, updated_at)
     values (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`
  ).run(orderId, input.restaurant_id, input.customer_profile_id ?? null, input.customer_name.trim(), input.customer_phone.trim(), total, input.notes ?? null, now, now);

  for (const line of lines) {
    db.prepare(
      `insert into order_items (id, order_id, menu_item_id, item_name, item_price, quantity, created_at) values (?, ?, ?, ?, ?, ?, ?)`
    ).run(uuid(), orderId, line.id, line.name, line.price, line.quantity, now);
  }

  return {
    ok: true,
    order: {
      id: orderId,
      restaurant_id: input.restaurant_id,
      status: "pending",
      total_amount: total,
      items: lines.map((l) => ({ item_name: l.name, item_price: l.price, quantity: l.quantity })),
      created_at: now,
    },
  };
}
