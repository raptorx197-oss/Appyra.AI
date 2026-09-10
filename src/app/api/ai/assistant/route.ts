import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { runAssistant } from "@/lib/ai/assistant";
import type { Actor } from "@/lib/ai/core";

// backend/API.md — POST /api/ai/assistant. restaurant_id in the request body
// (if present) is never trusted — the actor's restaurantId always comes
// from the authenticated session, matching database/RLS.md's JWT trust
// boundary principle.
export async function POST(request: Request) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: { code: "unauthorized", message: "Not signed in." } }, { status: 401 });

  const body = await request.json().catch(() => null);
  const message = body?.message?.trim();
  if (!message) return NextResponse.json({ error: { code: "missing_field", message: "message is required." } }, { status: 400 });

  const actor: Actor = { type: "ai", profileId: session.profileId, restaurantId: session.restaurantId };
  const result = await runAssistant(message, actor);

  return NextResponse.json({
    reply: result.reply,
    toolCalls: result.toolCalls.map((c) => ({ tool: c.tool, args: c.args, outcome: c.outcome })),
  });
}
