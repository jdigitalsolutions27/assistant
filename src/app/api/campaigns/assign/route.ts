import { NextRequest, NextResponse } from "next/server";
import { enforceApiGuards, jsonError } from "@/lib/api-helpers";
import { assignLeadsToCampaignAuto } from "@/lib/services/data-service";
import { campaignAssignSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const guard = enforceApiGuards(request, { max: 10, windowMs: 60_000, bucket: "campaign-assign" });
  if (guard) return guard;

  try {
    const body = await request.json();
    const payload = campaignAssignSchema.parse(body);
    const result = await assignLeadsToCampaignAuto({
      campaignId: payload.campaign_id,
      autoOnly: payload.auto_only,
      includeStatuses: payload.include_statuses,
      limit: payload.limit,
    });
    return NextResponse.json({
      ...result,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
