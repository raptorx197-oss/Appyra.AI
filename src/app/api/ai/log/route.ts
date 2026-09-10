import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getStaffSession } from "@/lib/auth";

// Read-only, matching database/RLS.md — there is no UPDATE/DELETE route for
// this table anywhere in the app; src/lib/db.ts's triggers reject it at the
// database layer even if one were added by mistake.
export async function GET() {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: { code: "unauthorized", message: "Not signed in." } }, { status: 401 });

  const db = getDb();
  const rows = db
    .prepare(
      `select id, tool_name as toolName, requested_args as requestedArgs, authorization_level as authorizationLevel,
              execution_status as executionStatus, result_summary as resultSummary, created_at as createdAt
       from ai_action_log where restaurant_id = ? order by created_at desc limit 200`
    )
    .all(session.restaurantId) as Array<{ id: string; toolName: string; requestedArgs: string | null; authorizationLevel: string; executionStatus: string; resultSummary: string | null; createdAt: string }>;

  return NextResponse.json(rows.map((r) => ({ ...r, requestedArgs: r.requestedArgs ? JSON.parse(r.requestedArgs) : null })));
}
