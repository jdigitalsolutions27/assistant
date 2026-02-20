import { z } from "zod";
import { CAMPAIGN_STATUSES, EVENT_TYPES, LEAD_STATUSES, MESSAGE_ANGLES, MESSAGE_LANGUAGES, MESSAGE_TONES } from "@/lib/types";

export const leadStatusSchema = z.enum(LEAD_STATUSES);
export const eventTypeSchema = z.enum(EVENT_TYPES);
export const angleSchema = z.enum(MESSAGE_ANGLES);
export const languageSchema = z.enum(MESSAGE_LANGUAGES);
export const toneSchema = z.enum(MESSAGE_TONES);
export const campaignStatusSchema = z.enum(CAMPAIGN_STATUSES);

export const leadUpsertSchema = z
  .object({
    business_name: z.string().trim().min(1).max(180).optional(),
    category_id: z.string().uuid().nullable().optional(),
    location_id: z.string().uuid().nullable().optional(),
    campaign_id: z.string().uuid().nullable().optional(),
    facebook_url: z.string().url().optional().or(z.literal("")),
    website_url: z.string().url().optional().or(z.literal("")),
    phone: z.string().trim().max(60).optional(),
    email: z.string().email().optional().or(z.literal("")),
    address: z.string().trim().max(255).optional(),
    source: z.string().trim().min(1).max(64).default("manual"),
    notes: z.string().trim().max(800).optional(),
  })
  .refine((v) => Boolean(v.business_name) || Boolean(v.facebook_url), {
    message: "business_name or facebook_url is required.",
    path: ["business_name"],
  });

export const csvImportSchema = z.object({
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null(), z.undefined()]))).min(1),
  mapping: z.object({
    business_name: z.string().optional(),
    facebook_url: z.string().optional(),
    website_url: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
  }),
  category_id: z.string().uuid().nullable().optional(),
  location_id: z.string().uuid().nullable().optional(),
});

export const googlePlacesSearchSchema = z.object({
  category_id: z.string().uuid(),
  location_id: z.string().uuid(),
  keywords: z.array(z.string().trim().min(2)).min(1).max(20),
  import_leads: z.boolean().default(false),
  max_results: z.number().int().min(15).max(300).default(120),
});

export const aiScoreSchema = z.object({
  score: z.number().min(0).max(100),
  reasons: z.array(z.string().min(3)).min(1).max(5),
  opportunity_summary: z.string().min(10).max(400),
  suggested_angle: angleSchema,
});

export const messageVariantsSchema = z.object({
  variants: z
    .array(
      z.object({
        variant_label: z.enum(["A", "B", "C"]),
        message_text: z.string().min(30).max(1000),
      }),
    )
    .length(3),
});

export const generateMessageSchema = z.object({
  language: languageSchema,
  tone: toneSchema,
  angle: angleSchema.optional(),
});

export const outreachEventSchema = z.object({
  lead_id: z.string().uuid(),
  event_type: eventTypeSchema,
  metadata_json: z.record(z.string(), z.unknown()).default({}),
  status: leadStatusSchema.optional(),
});

export const settingsWeightSchema = z.object({
  heuristic: z.number().min(0).max(1),
  ai: z.number().min(0).max(1),
});

export const quickMessageRequestSchema = z.object({
  category_id: z.string().uuid(),
  language: languageSchema,
  tone: toneSchema,
  angle: angleSchema.optional(),
  business_name: z.string().trim().min(1).max(180).optional(),
  location_name: z.string().trim().min(1).max(120).optional(),
  context: z.string().trim().max(1200).optional(),
});

const prospectingPreviewLeadSchema = z.object({
  business_name: z.string().trim().max(180).nullable().optional(),
  address: z.string().trim().max(255).nullable().optional(),
  phone: z.string().trim().max(60).nullable().optional(),
  website_url: z.string().url().nullable().optional(),
  facebook_url: z.string().url().nullable().optional(),
  email: z.string().email().nullable().optional(),
  place_id: z.string().trim().max(120).nullable().optional(),
  raw_json: z.record(z.string(), z.unknown()).optional(),
});

export const prospectingBatchMessageSchema = z.object({
  category_id: z.string().uuid(),
  location_id: z.string().uuid(),
  language: languageSchema,
  tone: toneSchema,
  angle: angleSchema.optional(),
  min_fit_score: z.number().min(0).max(100).default(45),
  import_and_save: z.boolean().default(false),
  selected_rows: z.array(prospectingPreviewLeadSchema).min(1).max(40),
});

export const conversationReplyRequestSchema = z
  .object({
    category_id: z.string().uuid().optional(),
    language: languageSchema,
    tone: toneSchema,
    conversation_text: z.string().trim().max(4000).optional(),
    image_base64: z.string().trim().optional(),
    image_mime_type: z.enum(["image/png", "image/jpeg", "image/webp"]).optional(),
  })
  .refine((value) => Boolean(value.conversation_text) || Boolean(value.image_base64), {
    message: "Provide conversation_text or image_base64.",
    path: ["conversation_text"],
  });

export const conversationReplySchema = z.object({
  primary_reply: z.string().min(20).max(1200),
  alternatives: z.array(z.string().min(20).max(1200)).length(2),
  detected_intent: z.string().min(3).max(120),
  notes: z.array(z.string().min(3).max(160)).min(1).max(4),
});

export const campaignCreateSchema = z.object({
  name: z.string().trim().min(2).max(140),
  category_id: z.string().uuid().nullable().optional(),
  location_id: z.string().uuid().nullable().optional(),
  language: languageSchema.default("Taglish"),
  tone: toneSchema.default("Soft"),
  angle: angleSchema.default("booking"),
  min_quality_score: z.number().min(0).max(100).default(45),
  daily_send_target: z.number().int().min(1).max(500).default(20),
  follow_up_days: z.number().int().min(1).max(30).default(3),
  status: campaignStatusSchema.default("ACTIVE"),
  notes: z.string().trim().max(1000).optional(),
});

export const campaignPlaybookCreateSchema = z.object({
  name: z.string().trim().min(2).max(140),
  category_id: z.string().uuid().nullable().optional(),
  location_id: z.string().uuid().nullable().optional(),
  language: languageSchema.default("Taglish"),
  tone: toneSchema.default("Soft"),
  angle: angleSchema.default("booking"),
  min_quality_score: z.number().min(0).max(100).default(45),
  daily_send_target: z.number().int().min(1).max(500).default(20),
  follow_up_days: z.number().int().min(1).max(30).default(3),
  notes: z.string().trim().max(1000).optional(),
});

export const campaignAssignSchema = z.object({
  campaign_id: z.string().uuid(),
  auto_only: z.boolean().default(true),
  include_statuses: z.array(leadStatusSchema).min(1).max(LEAD_STATUSES.length).default(["NEW", "DRAFTED"]),
  limit: z.number().int().min(1).max(500).default(120),
});

export const followUpRunSchema = z.object({
  campaign_id: z.string().uuid().optional(),
  days_since_sent: z.number().int().min(1).max(30).default(3),
  limit: z.number().int().min(1).max(300).default(60),
});
