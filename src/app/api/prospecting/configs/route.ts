import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceApiGuards, jsonError } from "@/lib/api-helpers";
import { saveProspectingConfig } from "@/lib/services/data-service";

export const runtime = "nodejs";

const payloadSchema = z.object({
  name: z.string().trim().min(3).max(120),
  category_id: z.string().uuid(),
  location_id: z.string().uuid(),
  keywords: z.array(z.string().trim().min(2)).min(1).max(30),
});

export async function POST(request: NextRequest) {
  const guard = enforceApiGuards(request, { max: 20, windowMs: 60_000, bucket: "prospecting-configs" });
  if (guard) return guard;

  try {
    const body = await request.json();
    const payload = payloadSchema.parse(body);
    await saveProspectingConfig(payload);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error, 400);
  }
}
