import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceApiGuards, jsonError } from "@/lib/api-helpers";
import { evaluateContactVerification } from "@/lib/contact-verification";
import { enrichWebsiteContactData } from "@/lib/services/contact-enrichment";

export const runtime = "nodejs";

const payloadSchema = z.object({
  website_url: z.string().url(),
  phone: z.string().trim().max(60).nullable().optional(),
  existing_email: z.string().email().nullable().optional(),
  existing_facebook_url: z.string().url().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const guard = await enforceApiGuards(request, { max: 60, windowMs: 60_000, bucket: "contact-enrichment", roles: ["ADMIN", "AGENT"] });
  if (guard) return guard;

  try {
    const body = await request.json();
    const payload = payloadSchema.parse(body);
    const result = await enrichWebsiteContactData(payload.website_url);
    const facebook_url = result.facebook_url ?? payload.existing_facebook_url ?? null;
    const email = result.email ?? payload.existing_email ?? null;
    const verification = evaluateContactVerification({
      email,
      facebook_url,
      phone: payload.phone ?? null,
      website_url: payload.website_url,
    });
    return NextResponse.json({
      facebook_url,
      email,
      verification,
      checked_at: result.checked_at,
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
