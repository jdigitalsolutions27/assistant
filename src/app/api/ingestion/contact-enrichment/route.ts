import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceApiGuards, jsonError } from "@/lib/api-helpers";
import { enrichWebsiteContactData } from "@/lib/services/contact-enrichment";

export const runtime = "nodejs";

const payloadSchema = z.object({
  website_url: z.string().url(),
});

export async function POST(request: NextRequest) {
  const guard = await enforceApiGuards(request, { max: 60, windowMs: 60_000, bucket: "contact-enrichment", roles: ["ADMIN", "AGENT"] });
  if (guard) return guard;

  try {
    const body = await request.json();
    const payload = payloadSchema.parse(body);
    const result = await enrichWebsiteContactData(payload.website_url);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error, 400);
  }
}
