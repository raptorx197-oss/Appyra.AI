import { NextResponse } from "next/server";
import { getDb, verifyPassword } from "@/lib/db";
import { setStaffSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = body?.email?.trim();
  const password = body?.password;
  if (!email || !password) {
    return NextResponse.json({ error: { code: "missing_field", message: "Email and password are required." } }, { status: 400 });
  }

  const db = getDb();
  const user = db
    .prepare(`select id, password_hash as passwordHash from auth_users where email = ? and user_type = 'staff'`)
    .get(email) as { id: string; passwordHash: string } | undefined;

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: { code: "invalid_credentials", message: "Invalid email or password." } }, { status: 401 });
  }

  await setStaffSessionCookie(user.id);
  return NextResponse.json({ ok: true });
}
