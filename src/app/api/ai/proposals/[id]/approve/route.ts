import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/auth";
import { approveProposal, AuthorizationError } from "@/lib/ai/core";

// The only path by which a proposal's underlying change is actually
// applied. actor.type is 'human_staff' — a real person clicked Approve —
// which is what approveProposal() structurally requires.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getStaffSession();
  if (!session) return NextResponse.json({ error: { code: "unauthorized", message: "Not signed in." } }, { status: 401 });

  const { id } = await params;
  try {
    const proposal = approveProposal(id, { type: "human_staff", profileId: session.profileId, restaurantId: session.restaurantId });
    return NextResponse.json(proposal);
  } catch (err) {
    if (err instanceof AuthorizationError) {
      const status = err.code === "not_found" ? 404 : err.code === "already_resolved" ? 409 : 403;
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status });
    }
    return NextResponse.json({ error: { code: "unexpected_error", message: "Failed to approve proposal." } }, { status: 500 });
  }
}
