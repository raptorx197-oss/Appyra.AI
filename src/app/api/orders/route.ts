import { NextResponse } from "next/server";
import { createGuestOrder } from "@/lib/orders";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: { code: "invalid_json", message: "Request body must be JSON." } }, { status: 400 });
  }

  const result = createGuestOrder({
    restaurant_id: body.restaurant_id,
    customer_name: body.customer_name,
    customer_phone: body.customer_phone,
    customer_profile_id: body.customer_profile_id ?? null,
    items: body.items,
    notes: body.notes ?? null,
  });

  if (!result.ok) {
    return NextResponse.json({ error: { code: result.error.code, message: result.error.message } }, { status: result.error.status });
  }

  return NextResponse.json(result.order, { status: 201 });
}
