import { NextRequest, NextResponse } from "next/server";
import { enforceApiGuards, jsonError } from "@/lib/api-helpers";
import { generateFollowUpVariants } from "@/lib/ai";
import { lintOutreachText, sanitizeMessageVariants } from "@/lib/compliance";
import {
  createOutreachMessages,
  getCampaignById,
  getCategories,
  getLeadById,
  getLocations,
} from "@/lib/services/data-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = enforceApiGuards(request, { max: 20, windowMs: 60_000, bucket: "generate-follow-up" });
  if (guard) return guard;

  try {
    const params = await context.params;
    const leadBundle = await getLeadById(params.id);
    if (!leadBundle.lead) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

    const lead = leadBundle.lead;
    const [categories, locations, campaign] = await Promise.all([
      getCategories(),
      getLocations(),
      lead.campaign_id ? getCampaignById(lead.campaign_id) : Promise.resolve(null),
    ]);
    const category = categories.find((item) => item.id === lead.category_id);
    const location = locations.find((item) => item.id === lead.location_id);

    const rawVariants = await generateFollowUpVariants({
      lead,
      categoryName: category?.name ?? "Business",
      locationName: location?.name ?? "your area",
      language: campaign?.language ?? "Taglish",
      tone: campaign?.tone ?? "Soft",
      angle: campaign?.angle ?? category?.default_angle ?? "booking",
      context: "Follow-up draft for manual send.",
    });

    const variants = sanitizeMessageVariants(rawVariants);
    const complianceIssues = variants.flatMap((variant) =>
      lintOutreachText(variant.message_text).map((issue) => ({ ...issue, variant_label: variant.variant_label })),
    );

    await createOutreachMessages(
      lead.id,
      variants.map((variant) => ({
        ...variant,
        language: campaign?.language ?? "Taglish",
        angle: campaign?.angle ?? category?.default_angle ?? "booking",
        message_kind: "follow_up" as const,
      })),
      { replaceExisting: true, messageKind: "follow_up" },
    );

    return NextResponse.json({
      lead_id: lead.id,
      language: campaign?.language ?? "Taglish",
      tone: campaign?.tone ?? "Soft",
      angle: campaign?.angle ?? category?.default_angle ?? "booking",
      variants,
      compliance_issues: complianceIssues,
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}

