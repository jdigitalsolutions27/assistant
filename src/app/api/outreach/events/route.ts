import { NextRequest, NextResponse } from "next/server";
import { enforceApiGuards, jsonError } from "@/lib/api-helpers";
import { logOutreachEvent, updateLeadStatus } from "@/lib/services/data-service";
import { outreachEventSchema } from "@/lib/validations";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const guard = enforceApiGuards(request, { max: 60, windowMs: 60_000, bucket: "outreach-events" });
  if (guard) return guard;

  try {
    const body = await request.json();
    const payload = outreachEventSchema.parse(body);

    await logOutreachEvent({
      lead_id: payload.lead_id,
      event_type: payload.event_type,
      metadata_json: payload.metadata_json,
    });
    if (payload.status) {
      await updateLeadStatus(payload.lead_id, payload.status);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error, 400);
  }
}
