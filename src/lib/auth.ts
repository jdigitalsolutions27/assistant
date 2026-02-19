import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { env, requireEnv } from "@/lib/env";

const COOKIE_NAME = "jala_admin_session";
const COOKIE_AGE = 60 * 60 * 8;

function tokenFromPassword(password: string): string {
  return crypto.createHash("sha256").update(`jala:${password}`).digest("hex");
}

function expectedToken(): string {
  return tokenFromPassword(requireEnv("ADMIN_PASSWORD"));
}

export async function createAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, expectedToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_AGE,
    path: "/",
  });
}

export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function isAuthenticated(): Promise<boolean> {
  if (!env.ADMIN_PASSWORD) return false;
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  return value === expectedToken();
}

export async function requireAdminPage(pathname = "/dashboard"): Promise<void> {
  const ok = await isAuthenticated();
  if (!ok) {
    const next = encodeURIComponent(pathname);
    redirect(`/login?next=${next}`);
  }
}

export function requireAdminApi(request: NextRequest): boolean {
  if (!env.ADMIN_PASSWORD) return false;
  const token = request.cookies.get(COOKIE_NAME)?.value;
  return token === expectedToken();
}
