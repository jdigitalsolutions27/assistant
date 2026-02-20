import { NextResponse } from "next/server";
import { clientKeyFromHeaders, checkRateLimit } from "@/lib/rate-limit";
import { requireAdminApi } from "@/lib/auth";
import { env } from "@/lib/env";
import type { NextRequest } from "next/server";

export function enforceApiGuards(
  request: NextRequest,
  options?: { max?: number; windowMs?: number; bucket?: string },
): NextResponse | null {
  if (!requireAdminApi(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = clientKeyFromHeaders(request.headers);
  const limiter = checkRateLimit(`${options?.bucket ?? "api"}:${key}`, {
    max: options?.max ?? 30,
    windowMs: options?.windowMs ?? 60_000,
  });
  if (!limiter.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  return null;
}

export function jsonError(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ error: message }, { status });
}

export function requireMaintenanceToken(request: NextRequest): boolean {
  const expected = env.MAINTENANCE_API_KEY ?? env.CRON_SECRET;
  if (!expected) return false;
  const headerValue = request.headers.get("x-maintenance-key") ?? request.headers.get("authorization");
  if (!headerValue) return false;
  const token = headerValue.startsWith("Bearer ") ? headerValue.slice(7) : headerValue;
  return token === expected;
}
