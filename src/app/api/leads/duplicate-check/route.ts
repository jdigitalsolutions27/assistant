import { NextRequest, NextResponse } from "next/server";
import { enforceApiGuards, jsonError } from "@/lib/api-helpers";
import { findPotentialLeadDuplicates } from "@/lib/services/data-service";
import { normalizeUrl } from "@/lib/utils";
import { z } from "zod";

export const runtime = "nodejs";

const duplicateCheckSchema = z
  .object({
    business_name: z.string().trim().max(180).optional(),
    website_url: z.string().trim().max(255).optional(),
    facebook_url: z.string().trim().max(255).optional(),
    phone: z.string().trim().max(60).optional(),
    location_id: z.string().uuid().optional().nullable(),
    address: z.string().trim().max(255).optional(),
    limit: z.number().int().min(1).max(20).optional(),
  })
  .refine((value) => Boolean(value.business_name) || Boolean(value.website_url) || Boolean(value.facebook_url) || Boolean(value.phone), {
    message: "Provide at least business name, website, facebook, or phone.",
    path: ["business_name"],
  });

export async function POST(request: NextRequest) {
  const guard = enforceApiGuards(request, { max: 30, windowMs: 60_000, bucket: "duplicate-check" });
  if (guard) return guard;

  try {
    const body = await request.json();
    const payload = duplicateCheckSchema.parse({
      ...body,
      website_url: normalizeUrl(String(body?.website_url ?? "")) ?? undefined,
      facebook_url: normalizeUrl(String(body?.facebook_url ?? "")) ?? undefined,
      phone: String(body?.phone ?? "").trim() || undefined,
      business_name: String(body?.business_name ?? "").trim() || undefined,
      address: String(body?.address ?? "").trim() || undefined,
      location_id: String(body?.location_id ?? "") || undefined,
      limit: typeof body?.limit === "number" ? body.limit : undefined,
    });

    const matches = await findPotentialLeadDuplicates({
      business_name: payload.business_name,
      website_url: payload.website_url,
      facebook_url: payload.facebook_url,
      phone: payload.phone,
      location_id: payload.location_id ?? undefined,
      address: payload.address,
      limit: payload.limit,
    });

    return NextResponse.json({
      has_match: matches.length > 0,
      max_confidence: matches.length ? Math.max(...matches.map((item) => item.confidence)) : 0,
      matches,
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}

