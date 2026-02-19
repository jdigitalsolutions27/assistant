import { NextRequest, NextResponse } from "next/server";
import { enforceApiGuards, jsonError } from "@/lib/api-helpers";
import { generateAiLeadScore } from "@/lib/ai";
import { computeHeuristicScore } from "@/lib/scoring";
import {
  getCategories,
  getKeywordPackByCategory,
  getLeadById,
  getLocations,
  getScoreWeights,
  insertLeadEnrichment,
  saveScores,
} from "@/lib/services/data-service";
import { clampScore } from "@/lib/utils";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const guard = enforceApiGuards(request, { max: 20, windowMs: 60_000, bucket: "score-lead" });
  if (guard) return guard;

  try {
    const params = await context.params;
    const leadBundle = await getLeadById(params.id);
    if (!leadBundle.lead) {
      return NextResponse.json({ error: "Lead not found." }, { status: 404 });
    }

    const lead = leadBundle.lead;
    const [categories, locations, weights] = await Promise.all([getCategories(), getLocations(), getScoreWeights()]);
    const category = categories.find((item) => item.id === lead.category_id);
    const location = locations.find((item) => item.id === lead.location_id) ?? null;
    const pack = lead.category_id ? await getKeywordPackByCategory(lead.category_id) : null;
    const keywordList = pack?.keywords ?? [];

    const heuristic = await computeHeuristicScore({
      lead,
      keywords: keywordList,
      location,
    });

    const ai = await generateAiLeadScore({
      lead,
      categoryName: category?.name,
      locationName: location?.name,
      heuristicReasons: heuristic.reasons,
    });

    const total = clampScore(heuristic.score * weights.heuristic + ai.score * weights.ai);

    await saveScores({
      leadId: lead.id,
      scoreHeuristic: heuristic.score,
      scoreAi: ai.score,
      scoreTotal: total,
    });

    await insertLeadEnrichment({
      lead_id: lead.id,
      raw_json: {
        source: "scoring",
        heuristic,
        ai,
        category: category?.name ?? null,
      },
      detected_keywords: heuristic.detectedKeywords,
    });

    return NextResponse.json({
      score_heuristic: heuristic.score,
      score_ai: ai.score,
      score_total: total,
      reasons: [...heuristic.reasons, ...ai.reasons],
      opportunity_summary: ai.opportunity_summary,
      suggested_angle: ai.suggested_angle,
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
