import { NextRequest, NextResponse } from "next/server";
import { generateQuickMessageVariants } from "@/lib/ai";
import { enforceApiGuards, jsonError } from "@/lib/api-helpers";
import { lintOutreachText, sanitizeMessageVariants } from "@/lib/compliance";
import { computeLeadQualityScore } from "@/lib/lead-quality";
import {
  bulkCreateLeadsWithStats,
  createOutreachMessages,
  getCategories,
  getLocations,
  getTemplateFor,
  insertLeadEnrichment,
} from "@/lib/services/data-service";
import { prospectingBatchMessageSchema } from "@/lib/validations";

export const runtime = "nodejs";

type BatchPreviewLead = {
  business_name: string | null;
  address: string | null;
  phone: string | null;
  website_url: string | null;
  facebook_url: string | null;
  email: string | null;
  place_id: string | null;
  raw_json?: Record<string, unknown>;
};

type EvaluatedRow = {
  row: BatchPreviewLead;
  match_key: string;
  fit_score: number;
  eligible: boolean;
  reasons: string[];
  variants: Array<{ variant_label: "A" | "B" | "C"; message_text: string }>;
  compliance_issues: Array<{
    variant_label: "A" | "B" | "C";
    severity: "high" | "medium";
    rule: string;
    message: string;
    match: string;
  }>;
};

async function mapWithConcurrency<T, R>(
  items: T[],
  mapper: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current]);
    }
  }

  const workers = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

function normalizePhone(value: string | null): string {
  return (value ?? "").replace(/\D/g, "");
}

function normalizeUrlKey(value: string | null): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return `${parsed.hostname.replace(/^www\./, "").toLowerCase()}${parsed.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return raw.toLowerCase();
  }
}

function buildLeadMatcher(target: {
  business_name: string | null;
  address: string | null;
  phone: string | null;
  website_url: string | null;
  facebook_url: string | null;
}) {
  const website = normalizeUrlKey(target.website_url);
  const facebook = normalizeUrlKey(target.facebook_url);
  const phone = normalizePhone(target.phone);
  const business = (target.business_name ?? "").trim().toLowerCase();
  const address = (target.address ?? "").trim().toLowerCase();

  return (row: BatchPreviewLead) => {
    if (website && normalizeUrlKey(row.website_url) === website) return true;
    if (facebook && normalizeUrlKey(row.facebook_url) === facebook) return true;
    if (phone && normalizePhone(row.phone) === phone) return true;
    return business !== "" && business === (row.business_name ?? "").trim().toLowerCase() && address === (row.address ?? "").trim().toLowerCase();
  };
}

function buildPreviewKey(row: BatchPreviewLead): string {
  return [
    (row.business_name ?? "").trim().toLowerCase(),
    (row.address ?? "").trim().toLowerCase(),
    normalizeUrlKey(row.website_url),
    normalizeUrlKey(row.facebook_url),
    normalizePhone(row.phone),
    (row.email ?? "").trim().toLowerCase(),
    (row.place_id ?? "").trim().toLowerCase(),
  ].join("|");
}

function evaluateRowFit(row: BatchPreviewLead, categoryId: string, locationId: string, minFitScore: number): {
  fit_score: number;
  eligible: boolean;
  reasons: string[];
} {
  const fitScore = computeLeadQualityScore({
    business_name: row.business_name,
    website_url: row.website_url,
    facebook_url: row.facebook_url,
    phone: row.phone,
    email: row.email,
    address: row.address,
    category_id: categoryId,
    location_id: locationId,
  });

  const channels = [Boolean(row.website_url), Boolean(row.facebook_url), normalizePhone(row.phone).length >= 7, Boolean(row.email)].filter(Boolean).length;
  const reasons: string[] = [];
  if (!row.business_name?.trim()) reasons.push("Missing business name.");
  if (channels === 0) reasons.push("No reachable contact channel found.");
  if (fitScore < minFitScore) reasons.push(`Lead-fit score ${fitScore} is below threshold ${minFitScore}.`);

  return {
    fit_score: fitScore,
    eligible: channels > 0 && fitScore >= minFitScore,
    reasons: reasons.length ? reasons : ["Fit gate passed."],
  };
}

export async function POST(request: NextRequest) {
  const guard = enforceApiGuards(request, { max: 12, windowMs: 60_000, bucket: "prospecting-batch-message" });
  if (guard) return guard;

  try {
    const body = await request.json();
    const payload = prospectingBatchMessageSchema.parse(body);

    const [categories, locations] = await Promise.all([getCategories(), getLocations()]);
    const category = categories.find((item) => item.id === payload.category_id);
    const location = locations.find((item) => item.id === payload.location_id);
    if (!category || !location) {
      return NextResponse.json({ error: "Invalid category or location." }, { status: 400 });
    }

    const angle = payload.angle ?? category.default_angle;
    const template = await getTemplateFor(payload.category_id, payload.language, payload.tone);
    const selectedRows: BatchPreviewLead[] = payload.selected_rows.map((row) => ({
      business_name: row.business_name ?? null,
      address: row.address ?? null,
      phone: row.phone ?? null,
      website_url: row.website_url ?? null,
      facebook_url: row.facebook_url ?? null,
      email: row.email ?? null,
      place_id: row.place_id ?? null,
      raw_json: row.raw_json,
    }));

    const evaluated = await mapWithConcurrency(
      selectedRows,
      async (row): Promise<EvaluatedRow> => {
        const fit = evaluateRowFit(row, payload.category_id, payload.location_id, payload.min_fit_score);
        if (!fit.eligible) {
          return {
            row,
            match_key: buildPreviewKey(row),
            fit_score: fit.fit_score,
            eligible: false,
            reasons: fit.reasons,
            variants: [],
            compliance_issues: [],
          };
        }

        const contextParts = [
          row.address ? `Address: ${row.address}` : null,
          row.website_url ? `Website: ${row.website_url}` : null,
          row.facebook_url ? `Facebook: ${row.facebook_url}` : null,
          row.email ? `Email: ${row.email}` : null,
        ].filter(Boolean);
        const rawVariants = await generateQuickMessageVariants({
          categoryName: category.name,
          language: payload.language,
          tone: payload.tone,
          angle,
          businessName: row.business_name ?? undefined,
          locationName: location.name,
          context: contextParts.length ? contextParts.join(" | ") : undefined,
          templateHint: template?.template_text ?? null,
        });
        const variants = sanitizeMessageVariants(rawVariants);
        const complianceIssues = variants.flatMap((variant) =>
          lintOutreachText(variant.message_text).map((issue) => ({ ...issue, variant_label: variant.variant_label })),
        );

        return {
          row,
          match_key: buildPreviewKey(row),
          fit_score: fit.fit_score,
          eligible: true,
          reasons: fit.reasons,
          variants,
          compliance_issues: complianceIssues,
        };
      },
      6,
    );

    let imported = 0;
    let skipped_duplicates = 0;
    let drafts_saved = 0;

    if (payload.import_and_save) {
      const insertResult = await bulkCreateLeadsWithStats(
        evaluated.map((item) => ({
          business_name: item.row.business_name,
          address: item.row.address,
          phone: item.row.phone,
          website_url: item.row.website_url,
          facebook_url: item.row.facebook_url,
          email: item.row.email,
          category_id: payload.category_id,
          location_id: payload.location_id,
          source: "prospecting_batch",
          status: item.eligible && item.variants.length > 0 ? "DRAFTED" : "NEW",
        })),
      );

      imported = insertResult.inserted.length;
      skipped_duplicates = insertResult.skippedDuplicates;

      await mapWithConcurrency(
        insertResult.inserted,
        async (lead) => {
          const matched = evaluated.find((item) =>
            buildLeadMatcher({
              business_name: lead.business_name,
              address: lead.address,
              phone: lead.phone,
              website_url: lead.website_url,
              facebook_url: lead.facebook_url,
            })(item.row),
          );
          if (!matched) return;

          if (matched.eligible && matched.variants.length > 0) {
            await createOutreachMessages(
              lead.id,
              matched.variants.map((variant) => ({
                variant_label: variant.variant_label,
                message_text: variant.message_text,
                language: payload.language,
                angle,
                message_kind: "initial",
              })),
              { replaceExisting: true, messageKind: "initial" },
            );
            drafts_saved += 1;
          }

          await insertLeadEnrichment({
            lead_id: lead.id,
            raw_json: {
              source: "prospecting_batch",
              generated_at: new Date().toISOString(),
              fit_score: matched.fit_score,
              fit_gate_passed: matched.eligible,
              fit_reasons: matched.reasons,
              compliance_issues: matched.compliance_issues,
              place_id: matched.row.place_id ?? null,
              raw: matched.row.raw_json ?? {},
            },
            detected_keywords: [],
          });
        },
        6,
      );
    }

    return NextResponse.json({
      category: category.name,
      location: location.name,
      language: payload.language,
      tone: payload.tone,
      angle,
      generated: evaluated.filter((item) => item.eligible && item.variants.length > 0).length,
      skipped_gate: evaluated.filter((item) => !item.eligible).length,
      imported,
      skipped_duplicates,
      drafts_saved,
      items: evaluated.map((item) => ({
        match_key: item.match_key,
        business_name: item.row.business_name,
        address: item.row.address,
        website_url: item.row.website_url,
        facebook_url: item.row.facebook_url,
        email: item.row.email,
        fit_score: item.fit_score,
        eligible: item.eligible,
        reasons: item.reasons,
        variants: item.variants,
        compliance_issues: item.compliance_issues,
      })),
    });
  } catch (error) {
    return jsonError(error, 400);
  }
}
