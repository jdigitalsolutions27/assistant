import { NextRequest, NextResponse } from "next/server";
import { enforceApiGuards, jsonError } from "@/lib/api-helpers";
import { createCampaign, getCampaigns } from "@/lib/services/data-service";
import { campaignCreateSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const guard = enforceApiGuards(request, { max: 30, windowMs: 60_000, bucket: "campaign-list" });
  if (guard) return guard;

  try {
    const status = request.nextUrl.searchParams.get("status");
    const campaigns = await getCampaigns({
      status: status === "ACTIVE" || status === "PAUSED" || status === "ARCHIVED" ? status : "ALL",
    });
    return NextResponse.json({ campaigns });
  } catch (error) {
    return jsonError(error, 400);
  }
}

export async function POST(request: NextRequest) {
  const guard = enforceApiGuards(request, { max: 15, windowMs: 60_000, bucket: "campaign-create" });
  if (guard) return guard;

  try {
    const body = await request.json();
    const payload = campaignCreateSchema.parse(body);
    const campaign = await createCampaign({
      ...payload,
      category_id: payload.category_id ?? null,
      location_id: payload.location_id ?? null,
    });
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    return jsonError(error, 400);
  }
}
