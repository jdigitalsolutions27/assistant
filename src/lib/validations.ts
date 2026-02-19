import { z } from "zod";
import { EVENT_TYPES, LEAD_STATUSES, MESSAGE_ANGLES, MESSAGE_LANGUAGES, MESSAGE_TONES } from "@/lib/types";

export const leadStatusSchema = z.enum(LEAD_STATUSES);
export const eventTypeSchema = z.enum(EVENT_TYPES);
export const angleSchema = z.enum(MESSAGE_ANGLES);
export const languageSchema = z.enum(MESSAGE_LANGUAGES);
export const toneSchema = z.enum(MESSAGE_TONES);

export const leadUpsertSchema = z
  .object({
    business_name: z.string().trim().min(1).max(180).optional(),
    category_id: z.string().uuid().nullable().optional(),
    location_id: z.string().uuid().nullable().optional(),
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
  max_results: z.number().int().min(1).max(60).default(30),
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
