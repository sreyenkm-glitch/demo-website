"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";

export type LoginState = { error?: string; email?: string };

// Simple in-memory throttle per email (per server instance). Good enough to blunt brute force on a small team app.
const attempts = new Map<string, { n: number; until: number }>();

export async function login(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Email and password, please.", email };

  const a = attempts.get(email);
  if (a && a.until > Date.now()) return { error: "Too many tries. Breathe, then try again in a minute.", email };

  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  const ok = user && user.active && (await verifyPassword(password, user.passwordHash));
  if (!ok || !user) {
    const n = (a?.n ?? 0) + 1;
    attempts.set(email, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
    return { error: "That combo didn't work.", email };
  }
  attempts.delete(email);
  await createSession(user.id);
  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function setThemePref(mode: "light" | "dark" | "system") {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  jar.set("obsa_theme", mode, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
