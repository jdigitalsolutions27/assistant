import { NextRequest, NextResponse } from "next/server";
import { enforceApiGuards, jsonError } from "@/lib/api-helpers";
import { generateOutreachVariants } from "@/lib/ai";
import { generateMessageSchema } from "@/lib/validations";
import {
  createOutreachMessages,
  getCategories,
  getLeadById,
  getLocations,
  getTemplateFor,
  updateLeadStatus,
} from "@/lib/services/data-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = enforceApiGuards(request, { max: 25, windowMs: 60_000, bucket: "generate-messages" });
  if (guard) return guard;

  try {
    const params = await context.params;
    const body = await request.json();
    const payload = generateMessageSchema.parse(body);

    const leadBundle = await getLeadById(params.id);
    if (!leadBundle.lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

    const lead = leadBundle.lead;
    const [categories, locations] = await Promise.all([getCategories(), getLocations()]);
    const category = categories.find((item) => item.id === lead.category_id);
    const location = locations.find((item) => item.id === lead.location_id);
    const angle = payload.angle ?? category?.default_angle ?? "organization";
    const template = lead.category_id ? await getTemplateFor(lead.category_id, payload.language, payload.tone) : null;

    const variants = await generateOutreachVariants({
      lead,
      categoryName: category?.name ?? "Business",
      locationName: location?.name ?? "your area",
      language: payload.language,
      tone: payload.tone,
      angle,
      templateHint: template?.template_text ?? null,
    });

    await createOutreachMessages(
      lead.id,
      variants.map((variant) => ({
        ...variant,
        language: payload.language,
        angle,
      })),
    );

    await updateLeadStatus(lead.id, "DRAFTED");

    return NextResponse.json({ variants, angle, language: payload.language, tone: payload.tone });
  } catch (error) {
    return jsonError(error, 400);
  }
}
