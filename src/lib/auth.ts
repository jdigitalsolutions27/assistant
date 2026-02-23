import "server-only";

import crypto from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getDb } from "@/lib/db/client";
import { userAccounts, userSessions } from "@/lib/db/schema";
import type { UserRole } from "@/lib/types";

const COOKIE_NAME = "jala_session";
const COOKIE_AGE = 60 * 60 * 8;

export type SessionUser = {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  assigned_category_id: string | null;
  is_active: boolean;
  must_change_password: boolean;
};

function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(`jala:session:${token}`).digest("hex");
}

function toSessionUser(row: {
  id: string;
  username: string;
  display_name: string;
  role: UserRole;
  assigned_category_id: string | null;
  is_active: boolean;
  must_change_password: boolean;
}): SessionUser {
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    role: row.role,
    assigned_category_id: row.assigned_category_id,
    is_active: row.is_active,
    must_change_password: row.must_change_password,
  };
}

async function lookupSessionUserByToken(token: string): Promise<SessionUser | null> {
  const tokenHash = hashSessionToken(token);
  const rows = await getDb()
    .select({
      id: userAccounts.id,
      username: userAccounts.username,
      display_name: userAccounts.display_name,
      role: userAccounts.role,
      assigned_category_id: userAccounts.assigned_category_id,
      is_active: userAccounts.is_active,
      must_change_password: userAccounts.must_change_password,
    })
    .from(userSessions)
    .innerJoin(userAccounts, eq(userSessions.user_id, userAccounts.id))
    .where(and(eq(userSessions.token_hash, tokenHash), gt(userSessions.expires_at, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row || !row.is_active) return null;
  return toSessionUser({
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    role: row.role as UserRole,
    assigned_category_id: row.assigned_category_id,
    is_active: row.is_active,
    must_change_password: row.must_change_password,
  });
}

export function getDashboardPathForUser(user: Pick<SessionUser, "role">): string {
  return user.role === "AGENT" ? "/dashboard/prospecting" : "/dashboard";
}

export function canAccessCategory(user: SessionUser, categoryId: string): boolean {
  if (user.role === "ADMIN") return true;
  return Boolean(user.assigned_category_id) && user.assigned_category_id === categoryId;
}

export async function createUserSession(userId: string): Promise<void> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + COOKIE_AGE * 1000);

  await getDb().insert(userSessions).values({
    user_id: userId,
    token_hash: hashSessionToken(token),
    expires_at: expiresAt,
  });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_AGE,
    path: "/",
  });
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    await getDb().delete(userSessions).where(eq(userSessions.token_hash, hashSessionToken(token)));
  }
  cookieStore.delete(COOKIE_NAME);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const user = await lookupSessionUserByToken(token);
  if (!user) {
    cookieStore.delete(COOKIE_NAME);
    return null;
  }
  return user;
}

export async function getApiSessionUser(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return lookupSessionUserByToken(token);
}

export async function isAuthenticated(): Promise<boolean> {
  const user = await getSessionUser();
  return Boolean(user);
}

export async function requireAuthenticatedPage(pathname = "/dashboard"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const next = encodeURIComponent(pathname);
    redirect(`/login?next=${next}`);
  }
  return user;
}

export async function requireAdminPage(pathname = "/dashboard"): Promise<SessionUser> {
  const user = await requireAuthenticatedPage(pathname);
  if (user.role !== "ADMIN") {
    redirect(getDashboardPathForUser(user));
  }
  return user;
}

