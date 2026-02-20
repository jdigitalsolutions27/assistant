import { NextRequest, NextResponse } from "next/server";
import { enforceApiGuards, jsonError, requireMaintenanceToken } from "@/lib/api-helpers";
import { runNightlyMaintenance } from "@/lib/services/maintenance-service";

export const runtime = "nodejs";

async function run(payload: {
  contact_days_stale?: number;
  contact_limit?: number;
  follow_up_limit_per_campaign?: number;
}) {
  const result = await runNightlyMaintenance({
    contactDaysStale: typeof payload.contact_days_stale === "number" ? payload.contact_days_stale : 21,
    contactLimit: typeof payload.contact_limit === "number" ? payload.contact_limit : 120,
    followUpLimitPerCampaign:
      typeof payload.follow_up_limit_per_campaign === "number" ? payload.follow_up_limit_per_campaign : 60,
  });
  return NextResponse.json({
    ...result,
    generated_at: new Date().toISOString(),
  });
}

function ensureAuthorized(request: NextRequest, bucket: string) {
  const adminGuard = enforceApiGuards(request, { max: 4, windowMs: 60_000, bucket });
  const internalTokenOk = requireMaintenanceToken(request);
  if (adminGuard && !internalTokenOk) return adminGuard;
  return null;
}

export async function POST(request: NextRequest) {
  const guard = ensureAuthorized(request, "maintenance-nightly");
  if (guard) return guard;

  try {
    const body = await request.json().catch(() => ({}));
    return await run(body);
  } catch (error) {
    return jsonError(error, 400);
  }
}

export async function GET(request: NextRequest) {
  const guard = ensureAuthorized(request, "maintenance-nightly-get");
  if (guard) return guard;

  try {
    const q = request.nextUrl.searchParams;
    return await run({
      contact_days_stale: Number(q.get("contact_days_stale") ?? 21),
      contact_limit: Number(q.get("contact_limit") ?? 120),
      follow_up_limit_per_campaign: Number(q.get("follow_up_limit_per_campaign") ?? 60),
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
