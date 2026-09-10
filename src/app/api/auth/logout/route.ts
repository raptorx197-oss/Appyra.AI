import { NextResponse } from "next/server";
import { clearStaffSessionCookie } from "@/lib/auth";

export async function POST() {
  await clearStaffSessionCookie();
  return NextResponse.json({ ok: true });
}
