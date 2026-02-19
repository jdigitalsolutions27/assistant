import "server-only";

import OpenAI from "openai";
import { env, requireEnv } from "@/lib/env";
import { aiScoreSchema, messageVariantsSchema } from "@/lib/validations";
import type { Lead, MessageAngle, MessageLanguage, MessageTone } from "@/lib/types";
import { clampScore } from "@/lib/utils";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (client) return client;
  client = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  return client;
}

function parseJsonObject<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function generateAiLeadScore(args: {
  lead: Lead;
  categoryName?: string;
  locationName?: string;
  heuristicReasons: string[];
}): Promise<{
  score: number;
  reasons: string[];
  opportunity_summary: string;
  suggested_angle: MessageAngle;
}> {
  if (!env.OPENAI_API_KEY) {
    return {
      score: 50,
      reasons: ["OPENAI_API_KEY is not configured, using fallback score."],
      opportunity_summary: "Configure OpenAI for richer lead intent analysis.",
      suggested_angle: "organization",
    };
  }

  const systemPrompt = [
    "You score lead quality for a local digital agency.",
    "Return strict JSON only. No markdown.",
    'Schema: {"score": number 0-100, "reasons": string[], "opportunity_summary": string, "suggested_angle": "booking"|"low_volume"|"organization"}',
    "Avoid guarantees or unrealistic claims.",
  ].join("\n");

  const userPrompt = JSON.stringify(
    {
      lead: args.lead,
      category: args.categoryName ?? "Unknown",
      location: args.locationName ?? "Unknown",
      heuristic_reasons: args.heuristicReasons,
    },
    null,
    2,
  );

  const response = await getClient().responses.create({
    model: env.OPENAI_MODEL,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: systemPrompt }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: userPrompt }],
      },
    ],
    temperature: 0.2,
  });

  const text = response.output_text;
  const parsed = parseJsonObject<unknown>(text);
  const validated = aiScoreSchema.safeParse(parsed);

  if (!validated.success) {
    return {
      score: 55,
      reasons: ["AI returned non-conforming response; fallback score applied."],
      opportunity_summary: "Lead likely has potential but needs manual review.",
      suggested_angle: "organization",
    };
  }

  return {
    ...validated.data,
    score: clampScore(validated.data.score),
  };
}

export async function generateOutreachVariants(args: {
  lead: Lead;
  categoryName: string;
  locationName: string;
  language: MessageLanguage;
  tone: MessageTone;
  angle: MessageAngle;
  templateHint?: string | null;
}): Promise<
  Array<{
    variant_label: "A" | "B" | "C";
    message_text: string;
  }>
> {
  const fallback = [
    {
      variant_label: "A" as const,
      message_text: `Hi! Jay here from J-Digital Solutions. Napansin ko ang ${args.lead.business_name ?? "business"} ninyo sa ${args.locationName}. Curious lang, paano niyo currently mina-manage ang inquiries from Facebook? We help local ${args.categoryName.toLowerCase()} teams improve response flow and booking follow-ups. If open ka, I can share a quick idea tailored to your page.`,
    },
    {
      variant_label: "B" as const,
      message_text: `Hello, this is Jay from J-Digital Solutions. I came across ${args.lead.business_name ?? "your business"} and wanted to ask: are Facebook inquiries turning into consistent bookings right now? We support ${args.categoryName.toLowerCase()} owners with better lead handling and organized follow-up. If helpful, I can send a short recommendation.`,
    },
    {
      variant_label: "C" as const,
      message_text: `Hi po, Jay from J-Digital Solutions here. I noticed your ${args.categoryName.toLowerCase()} presence in ${args.locationName}. Quick question: who handles incoming inquiries during busy hours? We help teams respond faster and avoid missed leads through a simple workflow. Open ka ba to a quick suggestion?`,
    },
  ];

  if (!env.OPENAI_API_KEY) return fallback;

  const systemPrompt = [
    "You write compliant outreach messages for manual Facebook Page messaging.",
    "Never claim guaranteed results. Avoid spam phrasing.",
    "Each message must include: friendly intro as Jay from J-Digital Solutions, business context, one qualifying question, clear value, soft CTA.",
    "Return strict JSON only with 3 variants A/B/C.",
    'Schema: {"variants":[{"variant_label":"A|B|C","message_text":"..."}]}',
  ].join("\n");

  const userPrompt = JSON.stringify(
    {
      lead: args.lead,
      category: args.categoryName,
      location: args.locationName,
      language: args.language,
      tone: args.tone,
      angle: args.angle,
      template_hint: args.templateHint ?? null,
    },
    null,
    2,
  );

  try {
    const response = await getClient().responses.create({
      model: env.OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userPrompt }],
        },
      ],
      temperature: 0.7,
    });

    const parsed = parseJsonObject<unknown>(response.output_text);
    const validated = messageVariantsSchema.safeParse(parsed);
    if (validated.success) {
      return validated.data.variants;
    }
  } catch {
    // fall through to fallback.
  }

  return fallback;
}
