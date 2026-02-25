import { NextRequest, NextResponse } from "next/server";
import { getApiSessionUser } from "@/lib/auth";
import { enforceApiGuards, ensureCategoryAccess, jsonError } from "@/lib/api-helpers";
import { markProspectingSentAction } from "@/lib/services/data-service";
import { buildProspectingMatchKey } from "@/lib/prospecting-match-key";
import { prospectingMarkSentSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const guard = await enforceApiGuards(request, { max: 40, windowMs: 60_000, bucket: "prospecting-actions", roles: ["ADMIN", "AGENT"] });
  if (guard) return guard;

  try {
    const user = await getApiSessionUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const payload = prospectingMarkSentSchema.parse(body);
    const categoryGuard = ensureCategoryAccess(user, payload.category_id);
    if (categoryGuard) return categoryGuard;

    const matchKey = buildProspectingMatchKey({
      place_id: payload.place_id,
      business_name: payload.business_name,
      address: payload.address,
      website_url: payload.website_url,
      facebook_url: payload.facebook_url,
      phone: payload.phone,
    });

    await markProspectingSentAction({
      user_id: user.id,
      category_id: payload.category_id,
      location_id: payload.location_id,
      match_key: matchKey,
      business_name: payload.business_name ?? null,
      address: payload.address ?? null,
      website_url: payload.website_url ?? null,
      facebook_url: payload.facebook_url ?? null,
      phone: payload.phone ?? null,
      email: payload.email ?? null,
      metadata_json: {
        role: user.role,
        username: user.username,
        display_name: user.display_name,
        raw_json: payload.raw_json ?? {},
      },
    });

    return NextResponse.json({
      ok: true,
      match_key: matchKey,
      marked_by: user.display_name,
      marked_at: new Date().toISOString(),
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
