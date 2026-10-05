import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, isEphemeralDemo, schema } from "@/db";
import type { User } from "@/db/schema";
import { newToken } from "./ids";

export const SESSION_COOKIE = "obsa_session";
const SESSION_DAYS = 30;

export type SessionUser = Pick<User, "id" | "name" | "email" | "role" | "department" | "title" | "avatar">;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export { hashPassword, verifyPassword } from "./auth-hash";

/*
 * Demo-mode sessions. On Vercel without a shared database every server has its own throwaway
 * SQLite copy, so a session row written on one server is unknown to the next. In that mode the
 * cookie itself carries the session: "d1.<userId>.<expiresMs>.<hmac>". The user row is still
 * loaded (and must be active) on every request. With a real database, sessions stay DB-backed.
 */
const DEMO_PREFIX = "d1.";
function demoSecret() {
  return (
    process.env.AUTH_SECRET ||
    createHash("sha256")
      .update(`obsa-demo:${process.env.VERCEL_PROJECT_ID ?? ""}:${process.env.VERCEL_GIT_REPO_ID ?? ""}`)
      .digest("hex")
  );
}
const demoSig = (payload: string) => createHmac("sha256", demoSecret()).update(payload).digest("base64url");

function verifyDemoToken(token: string): string | null {
  const [userId, exp, sig] = token.slice(DEMO_PREFIX.length).split(".");
  if (!userId || !exp || !sig) return null;
  const expected = Buffer.from(demoSig(`${userId}.${exp}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(exp) < Date.now()) return null;
  return userId;
}

export async function createSession(userId: string) {
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  let token: string;
  if (isEphemeralDemo()) {
    const payload = `${userId}.${expires.getTime()}`;
    token = `${DEMO_PREFIX}${payload}.${demoSig(payload)}`;
  } else {
    token = newToken();
    await db.insert(schema.sessions).values({ id: hashToken(token), userId, expiresAt: expires.toISOString() });
    // Opportunistic cleanup of expired sessions.
    await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date().toISOString()));
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token && !token.startsWith(DEMO_PREFIX)) await db.delete(schema.sessions).where(eq(schema.sessions.id, hashToken(token)));
  jar.delete(SESSION_COOKIE);
}

/** Resolve the signed-in user from the session cookie. Memoized per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  if (token.startsWith(DEMO_PREFIX)) {
    // Only honoured while the deployment really is in demo mode.
    const userId = isEphemeralDemo() ? verifyDemoToken(token) : null;
    if (!userId) return null;
    const u = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
    if (!u || !u.active) return null;
    return { id: u.id, name: u.name, email: u.email, role: u.role, department: u.department, title: u.title, avatar: u.avatar };
  }
  const rows = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      department: schema.users.department,
      title: schema.users.title,
      avatar: schema.users.avatar,
      active: schema.users.active,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.id, hashToken(token)), gt(schema.sessions.expiresAt, new Date().toISOString())))
    .limit(1);
  const row = rows[0];
  if (!row || !row.active) return null;
  const { active: _active, ...user } = row;
  return user;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}

/** For server actions / route handlers: throw instead of redirecting. */
export class AuthError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
  }
}

export async function assertUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError(401, "Sign in first.");
  return user;
}

export async function assertAdmin(): Promise<SessionUser> {
  const user = await assertUser();
  if (user.role !== "admin") throw new AuthError(403, "Admins only.");
  return user;
}
