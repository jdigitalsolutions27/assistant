import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceApiGuards, jsonError } from "@/lib/api-helpers";
import { refreshStaleLeadContacts } from "@/lib/services/maintenance-service";

export const runtime = "nodejs";

const payloadSchema = z.object({
  days_stale: z.number().int().min(1).max(180).default(21),
  limit: z.number().int().min(1).max(200).default(60),
});

export async function POST(request: NextRequest) {
  const guard = enforceApiGuards(request, { max: 8, windowMs: 60_000, bucket: "maintenance-refresh" });
  if (guard) return guard;

  try {
    const body = await request.json().catch(() => ({}));
    const payload = payloadSchema.parse(body);
    const result = await refreshStaleLeadContacts({
      daysStale: payload.days_stale,
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
