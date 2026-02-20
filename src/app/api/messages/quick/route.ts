import { NextRequest, NextResponse } from "next/server";
import { enforceApiGuards, jsonError } from "@/lib/api-helpers";
import { generateQuickMessageVariants } from "@/lib/ai";
import { lintOutreachText, sanitizeMessageVariants } from "@/lib/compliance";
import { quickMessageRequestSchema } from "@/lib/validations";
import { getCategories, getTemplateFor } from "@/lib/services/data-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const guard = enforceApiGuards(request, { max: 25, windowMs: 60_000, bucket: "quick-message" });
  if (guard) return guard;

  try {
    const body = await request.json();
    const payload = quickMessageRequestSchema.parse(body);

    const categories = await getCategories();
    const category = categories.find((item) => item.id === payload.category_id);
    if (!category) {
      return NextResponse.json({ error: "Category not found." }, { status: 404 });
    }

    const angle = payload.angle ?? category.default_angle;
    const template = await getTemplateFor(payload.category_id, payload.language, payload.tone);

    const rawVariants = await generateQuickMessageVariants({
      categoryName: category.name,
      language: payload.language,
      tone: payload.tone,
      angle,
      businessName: payload.business_name,
      locationName: payload.location_name,
      context: payload.context,
      templateHint: template?.template_text ?? null,
    });
    const variants = sanitizeMessageVariants(rawVariants);
    const complianceIssues = variants.flatMap((variant) =>
      lintOutreachText(variant.message_text).map((issue) => ({ ...issue, variant_label: variant.variant_label })),
    );

    return NextResponse.json({
      category: category.name,
      language: payload.language,
      tone: payload.tone,
      angle,
      variants,
      compliance_issues: complianceIssues,
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
