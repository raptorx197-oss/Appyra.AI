import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getStaffSession } from "@/lib/auth";

export async function GET() {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: { code: "unauthorized", message: "Not signed in." } }, { status: 401 });

  const db = getDb();
  const rows = db
    .prepare(
      `select id, capability, payload, status, approved_by_profile_id as approvedByProfileId, resolved_at as resolvedAt, created_at as createdAt
       from ai_action_proposals where restaurant_id = ? order by created_at desc`
    )
    .all(session.restaurantId) as Array<{ id: string; capability: string; payload: string; status: string; approvedByProfileId: string | null; resolvedAt: string | null; createdAt: string }>;

  const itemNameStmt = db.prepare(`select name from menu_items where id = ?`);
  const enriched = rows.map((r) => {
    const payload = JSON.parse(r.payload);
    const item = itemNameStmt.get(payload.menuItemId) as { name: string } | undefined;
    return { ...r, payload: { ...payload, itemName: item?.name ?? "(deleted item)" } };
  });

  return NextResponse.json(enriched);
}
