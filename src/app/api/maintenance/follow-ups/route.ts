import { NextRequest, NextResponse } from "next/server";
import { enforceApiGuards, jsonError, requireMaintenanceToken } from "@/lib/api-helpers";
import { followUpRunSchema } from "@/lib/validations";
import { generateFollowUpDrafts } from "@/lib/services/maintenance-service";

export const runtime = "nodejs";

async function runWithPayload(payloadInput: unknown) {
  const payload = followUpRunSchema.parse(payloadInput);
  const result = await generateFollowUpDrafts({
    campaignId: payload.campaign_id,
    daysSinceSent: payload.days_since_sent,
    limit: payload.limit,
  });

  return NextResponse.json({
    ...result,
    generated_at: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  const guard = enforceApiGuards(request, { max: 10, windowMs: 60_000, bucket: "maintenance-followups" });
  if (guard) return guard;

  try {
    const body = await request.json().catch(() => ({}));
    return await runWithPayload(body);
  } catch (error) {
    return jsonError(error, 400);
  }
}

export async function GET(request: NextRequest) {
  const adminGuard = enforceApiGuards(request, { max: 10, windowMs: 60_000, bucket: "maintenance-followups-get" });
  const internalTokenOk = requireMaintenanceToken(request);
  if (adminGuard && !internalTokenOk) return adminGuard;

  try {
    const daysSinceSent = Number(request.nextUrl.searchParams.get("days_since_sent") ?? 3);
    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 80);
    const campaignId = request.nextUrl.searchParams.get("campaign_id") || undefined;

    return await runWithPayload({
      campaign_id: campaignId,
      days_since_sent: Number.isFinite(daysSinceSent) ? daysSinceSent : 3,
      limit: Number.isFinite(limit) ? limit : 80,
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
