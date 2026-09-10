import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";

// ----------------------------------------------------------------------------
// Stand-in for Supabase Auth's JWT (see database/RLS.md — "JWT Trust
// Boundary"). Same principle preserved: the cookie only ever asserts a
// profile id; every route re-derives restaurant_id server-side from the
// profiles table rather than trusting a client-sent restaurant_id. Signed
// with HMAC so the cookie can't be forged without the server secret.
// ----------------------------------------------------------------------------

const SECRET = process.env.APPYRA_SESSION_SECRET || "dev-only-insecure-secret-change-me";
const COOKIE_NAME = "appyra_staff_session";

function sign(value: string): string {
  return createHmac("sha256", SECRET).update(value).digest("hex");
}

function pack(profileId: string): string {
  const sig = sign(profileId);
  return Buffer.from(`${profileId}.${sig}`).toString("base64url");
}

function unpack(token: string): string | null {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const [profileId, sig] = raw.split(".");
    if (!profileId || !sig) return null;
    const expected = sign(profileId);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return profileId;
  } catch {
    return null;
  }
}

export type StaffSession = { profileId: string; restaurantId: string; email: string; restaurantName: string };

export async function setStaffSessionCookie(profileId: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, pack(profileId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearStaffSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getStaffSession(): Promise<StaffSession | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const profileId = unpack(token);
  if (!profileId) return null;

  const db = getDb();
  const row = db
    .prepare(
      `select p.id as profileId, p.restaurant_id as restaurantId, u.email as email, r.name as restaurantName
       from profiles p
       join auth_users u on u.id = p.id
       join restaurants r on r.id = p.restaurant_id
       where p.id = ?`
    )
    .get(profileId) as StaffSession | undefined;

  return row ?? null;
}
