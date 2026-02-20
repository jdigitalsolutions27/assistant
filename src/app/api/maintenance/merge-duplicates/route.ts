import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceApiGuards, jsonError } from "@/lib/api-helpers";
import { mergeDuplicateLeads } from "@/lib/services/data-service";

export const runtime = "nodejs";

const payloadSchema = z.object({
  limit: z.number().int().min(1).max(1000).default(200),
});

export async function POST(request: NextRequest) {
  const guard = enforceApiGuards(request, { max: 8, windowMs: 60_000, bucket: "maintenance-merge-duplicates" });
  if (guard) return guard;

  try {
    const body = await request.json().catch(() => ({}));
    const payload = payloadSchema.parse(body);
    const result = await mergeDuplicateLeads({ limit: payload.limit });
    return NextResponse.json({
      ...result,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
