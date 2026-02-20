import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceApiGuards, jsonError } from "@/lib/api-helpers";
import { deleteProspectingConfig, saveProspectingConfig } from "@/lib/services/data-service";

export const runtime = "nodejs";

const payloadSchema = z.object({
  name: z.string().trim().min(3).max(120),
  category_id: z.string().uuid(),
  location_id: z.string().uuid(),
  keywords: z.array(z.string().trim().min(2)).min(1).max(30),
});

const deleteSchema = z.object({
  config_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const guard = enforceApiGuards(request, { max: 20, windowMs: 60_000, bucket: "prospecting-configs" });
  if (guard) return guard;

  try {
    const body = await request.json();
    const payload = payloadSchema.parse(body);
    const config = await saveProspectingConfig(payload);
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    return jsonError(error, 400);
  }
}

export async function DELETE(request: NextRequest) {
  const guard = enforceApiGuards(request, { max: 20, windowMs: 60_000, bucket: "prospecting-configs-delete" });
  if (guard) return guard;

  try {
    const queryId = request.nextUrl.searchParams.get("config_id");
    const body = queryId ? {} : await request.json().catch(() => ({}));
    const payload = deleteSchema.parse({
      config_id: queryId ?? body?.config_id,
    });
    await deleteProspectingConfig(payload.config_id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error, 400);
  }
}
