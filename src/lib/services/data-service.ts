import "server-only";

import { and, asc, desc, eq, ilike, inArray, max, or } from "drizzle-orm";
import { sanitizeOutreachText } from "@/lib/compliance";
import { getDb } from "@/lib/db/client";
import {
  appSettings,
  campaigns,
  campaignPlaybooks,
  categories,
  keywordPacks,
  leadEnrichment,
  leads,
  locations,
  messageTemplates,
  outreachEvents,
  outreachMessages,
  prospectingConfigs,
} from "@/lib/db/schema";
import { computeLeadQualityScore, normalizePhone, qualityTierFromScore } from "@/lib/lead-quality";
import type {
  Campaign,
  CampaignPlaybook,
  CampaignStatus,
  Category,
  DashboardKpis,
  KeywordPack,
  Lead,
  LeadStatus,
  Location,
  MessageAngle,
  MessageLanguage,
  MessageTemplate,
  MessageTone,
  OutreachEventType,
  OutreachMessage,
  ProspectingConfig,
  ScoreWeights,
} from "@/lib/types";

const DEFAULT_WEIGHTS: ScoreWeights = {
  heuristic: 0.45,
  ai: 0.55,
};

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function mapCategory(row: typeof categories.$inferSelect): Category {
  return {
    id: row.id,
    name: row.name,
    default_angle: row.default_angle,
    created_at: toIso(row.created_at)!,
  };
}

function mapLocation(row: typeof locations.$inferSelect): Location {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    region: row.region,
    country: row.country,
    created_at: toIso(row.created_at)!,
  };
}

function mapLead(row: typeof leads.$inferSelect): Lead {
  const qualityScore = computeLeadQualityScore({
    business_name: row.business_name,
    website_url: row.website_url,
    facebook_url: row.facebook_url,
    phone: row.phone,
    email: row.email,
    address: row.address,
    category_id: row.category_id,
    location_id: row.location_id,
  });

  return {
    id: row.id,
    business_name: row.business_name,
    category_id: row.category_id,
    location_id: row.location_id,
    campaign_id: row.campaign_id ?? null,
    facebook_url: row.facebook_url,
    website_url: row.website_url,
    phone: row.phone,
    email: row.email,
    address: row.address,
    source: row.source,
    status: row.status as LeadStatus,
    score_heuristic: row.score_heuristic,
    score_ai: row.score_ai,
    score_total: row.score_total,
    quality_score: qualityScore,
    quality_tier: qualityTierFromScore(qualityScore),
    last_contacted_at: toIso(row.last_contacted_at),
    created_at: toIso(row.created_at)!,
  };
}

function mapOutreachMessage(row: typeof outreachMessages.$inferSelect): OutreachMessage {
  return {
    id: row.id,
    lead_id: row.lead_id,
    language: row.language,
    angle: row.angle,
    variant_label: row.variant_label as "A" | "B" | "C",
    message_kind: row.message_kind as "initial" | "follow_up",
    message_text: row.message_text,
    created_at: toIso(row.created_at)!,
  };
}

function mapCampaign(row: typeof campaigns.$inferSelect): Campaign {
  return {
    id: row.id,
    name: row.name,
    category_id: row.category_id,
    location_id: row.location_id,
    language: row.language,
    tone: row.tone,
    angle: row.angle,
    min_quality_score: row.min_quality_score,
    daily_send_target: row.daily_send_target,
    follow_up_days: row.follow_up_days,
    status: row.status as CampaignStatus,
    notes: row.notes,
    created_at: toIso(row.created_at)!,
  };
}

function mapCampaignPlaybook(row: typeof campaignPlaybooks.$inferSelect): CampaignPlaybook {
  return {
    id: row.id,
    name: row.name,
    category_id: row.category_id,
    location_id: row.location_id,
    language: row.language,
    tone: row.tone,
    angle: row.angle,
    min_quality_score: row.min_quality_score,
    daily_send_target: row.daily_send_target,
    follow_up_days: row.follow_up_days,
    notes: row.notes,
    created_at: toIso(row.created_at)!,
  };
}

function mapMessageTemplate(row: typeof messageTemplates.$inferSelect): MessageTemplate {
  return {
    id: row.id,
    category_id: row.category_id,
    language: row.language,
    tone: row.tone,
    template_text: row.template_text,
    created_at: toIso(row.created_at)!,
  };
}

function mapProspectingConfig(row: typeof prospectingConfigs.$inferSelect): ProspectingConfig {
  return {
    id: row.id,
    name: row.name,
    category_id: row.category_id,
    location_id: row.location_id,
    keywords: row.keywords,
    created_at: toIso(row.created_at)!,
  };
}

export async function getCategories(): Promise<Category[]> {
  const rows = await getDb().select().from(categories).orderBy(asc(categories.name));
  return rows.map(mapCategory);
}

export async function getLocations(): Promise<Location[]> {
  const rows = await getDb().select().from(locations).orderBy(asc(locations.name));
  return rows.map(mapLocation);
}

export async function getKeywordPackByCategory(categoryId: string): Promise<KeywordPack | null> {
  const row = await getDb().select().from(keywordPacks).where(eq(keywordPacks.category_id, categoryId)).limit(1);
  if (!row[0]) return null;
  return row[0];
}

export async function getKeywordPacks(): Promise<KeywordPack[]> {
  return getDb().select().from(keywordPacks);
}

export async function getMessageTemplates(): Promise<MessageTemplate[]> {
  const rows = await getDb().select().from(messageTemplates).orderBy(desc(messageTemplates.created_at));
  return rows.map(mapMessageTemplate);
}

export async function getTemplateFor(
  categoryId: string,
  language: string,
  tone: string,
): Promise<MessageTemplate | null> {
  const row = await getDb()
    .select()
    .from(messageTemplates)
    .where(
      and(
        eq(messageTemplates.category_id, categoryId),
        eq(messageTemplates.language, language as (typeof messageTemplates.$inferSelect)["language"]),
        eq(messageTemplates.tone, tone as (typeof messageTemplates.$inferSelect)["tone"]),
      ),
    )
    .limit(1);

  if (!row[0]) return null;
  return mapMessageTemplate(row[0]);
}

export async function upsertMessageTemplate(payload: Omit<MessageTemplate, "id" | "created_at">): Promise<void> {
  const db = getDb();
  await db
    .delete(messageTemplates)
    .where(
      and(
        eq(messageTemplates.category_id, payload.category_id),
        eq(messageTemplates.language, payload.language),
        eq(messageTemplates.tone, payload.tone),
      ),
    );

  await db.insert(messageTemplates).values({
    category_id: payload.category_id,
    language: payload.language,
    tone: payload.tone,
    template_text: payload.template_text,
  });
}

export async function deleteMessageTemplate(templateId: string): Promise<void> {
  await getDb().delete(messageTemplates).where(eq(messageTemplates.id, templateId));
}

export async function getProspectingConfigs(): Promise<ProspectingConfig[]> {
  const rows = await getDb().select().from(prospectingConfigs).orderBy(desc(prospectingConfigs.created_at));
  return rows.map(mapProspectingConfig);
}

export async function getCampaigns(options?: {
  status?: CampaignStatus | "ALL";
}): Promise<Campaign[]> {
  const where = options?.status && options.status !== "ALL" ? eq(campaigns.status, options.status) : undefined;
  const rows = await getDb().select().from(campaigns).where(where).orderBy(desc(campaigns.created_at));
  return rows.map(mapCampaign);
}

export async function getCampaignById(id: string): Promise<Campaign | null> {
  const rows = await getDb().select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return rows[0] ? mapCampaign(rows[0]) : null;
}

export async function createCampaign(payload: {
  name: string;
  category_id?: string | null;
  location_id?: string | null;
  language: "Taglish" | "English" | "Tagalog" | "Waray";
  tone: "Soft" | "Direct" | "Value-Focused";
  angle: "booking" | "low_volume" | "organization";
  min_quality_score: number;
  daily_send_target: number;
  follow_up_days: number;
  status: CampaignStatus;
  notes?: string;
}): Promise<Campaign> {
  const rows = await getDb()
    .insert(campaigns)
    .values({
      name: payload.name,
      category_id: payload.category_id ?? null,
      location_id: payload.location_id ?? null,
      language: payload.language,
      tone: payload.tone,
      angle: payload.angle,
      min_quality_score: payload.min_quality_score,
      daily_send_target: payload.daily_send_target,
      follow_up_days: payload.follow_up_days,
      status: payload.status,
      notes: payload.notes?.trim() || null,
    })
    .returning();
  if (!rows[0]) throw new Error("Failed to create campaign.");
  return mapCampaign(rows[0]);
}

export async function updateCampaignStatus(campaignId: string, status: CampaignStatus): Promise<void> {
  await getDb().update(campaigns).set({ status }).where(eq(campaigns.id, campaignId));
}

export async function getCampaignPlaybooks(): Promise<CampaignPlaybook[]> {
  const rows = await getDb().select().from(campaignPlaybooks).orderBy(desc(campaignPlaybooks.created_at));
  return rows.map(mapCampaignPlaybook);
}

export async function createCampaignPlaybook(payload: {
  name: string;
  category_id?: string | null;
  location_id?: string | null;
  language: "Taglish" | "English" | "Tagalog" | "Waray";
  tone: "Soft" | "Direct" | "Value-Focused";
  angle: "booking" | "low_volume" | "organization";
  min_quality_score: number;
  daily_send_target: number;
  follow_up_days: number;
  notes?: string;
}): Promise<CampaignPlaybook> {
  const rows = await getDb()
    .insert(campaignPlaybooks)
    .values({
      name: payload.name,
      category_id: payload.category_id ?? null,
      location_id: payload.location_id ?? null,
      language: payload.language,
      tone: payload.tone,
      angle: payload.angle,
      min_quality_score: payload.min_quality_score,
      daily_send_target: payload.daily_send_target,
      follow_up_days: payload.follow_up_days,
      notes: payload.notes?.trim() || null,
    })
    .returning();
  if (!rows[0]) throw new Error("Failed to create campaign playbook.");
  return mapCampaignPlaybook(rows[0]);
}

export async function createCampaignFromPlaybook(playbookId: string, campaignName?: string): Promise<Campaign> {
  const rows = await getDb().select().from(campaignPlaybooks).where(eq(campaignPlaybooks.id, playbookId)).limit(1);
  const playbook = rows[0];
  if (!playbook) throw new Error("Playbook not found.");

  return createCampaign({
    name: campaignName?.trim() || `${playbook.name} - ${new Date().toISOString().slice(0, 10)}`,
    category_id: playbook.category_id,
    location_id: playbook.location_id,
    language: playbook.language,
    tone: playbook.tone,
    angle: playbook.angle,
    min_quality_score: playbook.min_quality_score,
    daily_send_target: playbook.daily_send_target,
    follow_up_days: playbook.follow_up_days,
    status: "ACTIVE",
    notes: playbook.notes ?? undefined,
  });
}

export async function saveProspectingConfig(payload: Omit<ProspectingConfig, "id" | "created_at">): Promise<ProspectingConfig> {
  const rows = await getDb().insert(prospectingConfigs).values(payload).returning();
  if (!rows[0]) throw new Error("Failed to save prospecting config.");
  return mapProspectingConfig(rows[0]);
}

export async function deleteProspectingConfig(configId: string): Promise<void> {
  await getDb().delete(prospectingConfigs).where(eq(prospectingConfigs.id, configId));
}

function buildLeadWhere(filters?: {
  status?: LeadStatus;
  categoryId?: string;
  locationId?: string;
  campaignId?: string;
  query?: string;
}) {
  return and(
    filters?.status ? eq(leads.status, filters.status) : undefined,
    filters?.categoryId ? eq(leads.category_id, filters.categoryId) : undefined,
    filters?.locationId ? eq(leads.location_id, filters.locationId) : undefined,
    filters?.campaignId ? eq(leads.campaign_id, filters.campaignId) : undefined,
    filters?.query
      ? or(
          ilike(leads.business_name, `%${filters.query}%`),
          ilike(leads.address, `%${filters.query}%`),
          ilike(leads.phone, `%${filters.query}%`),
          ilike(leads.email, `%${filters.query}%`),
          ilike(leads.website_url, `%${filters.query}%`),
          ilike(leads.facebook_url, `%${filters.query}%`),
        )
      : undefined,
  );
}

export async function listLeads(filters?: {
  status?: LeadStatus;
  categoryId?: string;
  locationId?: string;
  campaignId?: string;
  query?: string;
  qualityTier?: "High" | "Medium" | "Low";
  minScore?: number;
  sort?: "newest" | "oldest" | "highest_score" | "highest_quality" | "recently_contacted";
  limit?: number;
  offset?: number;
}): Promise<Lead[]> {
  const sort = filters?.sort ?? "newest";
  const limit = Math.max(1, Math.min(200, filters?.limit ?? 80));
  const offset = Math.max(0, filters?.offset ?? 0);
  const where = buildLeadWhere(filters);
  const needsPostFilter = Boolean(filters?.qualityTier) || typeof filters?.minScore === "number" || sort === "highest_quality";

  const orderBy = [
    sort === "oldest"
      ? asc(leads.created_at)
      : sort === "highest_score"
        ? desc(leads.score_total)
        : sort === "recently_contacted"
          ? desc(leads.last_contacted_at)
          : desc(leads.created_at),
    desc(leads.created_at),
  ] as const;

  const rows = needsPostFilter
    ? await getDb()
        .select()
        .from(leads)
        .where(where)
        .orderBy(...orderBy)
        .limit(Math.max(160, Math.min(2400, offset + limit + 180)))
    : await getDb()
        .select()
        .from(leads)
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset);

  let mapped = rows.map(mapLead);

  if (typeof filters?.minScore === "number" && Number.isFinite(filters.minScore)) {
    mapped = mapped.filter((lead) => (lead.score_total ?? 0) >= filters.minScore!);
  }
  if (filters?.qualityTier) {
    mapped = mapped.filter((lead) => lead.quality_tier === filters.qualityTier);
  }

  if (sort === "highest_quality") {
    mapped = mapped.sort((a, b) => {
      if (b.quality_score !== a.quality_score) return b.quality_score - a.quality_score;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  return needsPostFilter ? mapped.slice(offset, offset + limit) : mapped;
}

export async function getLeadById(id: string): Promise<{
  lead: Lead | null;
  enrichment: Record<string, unknown> | null;
  messages: OutreachMessage[];
  events: Array<{
    id: string;
    event_type: OutreachEventType;
    metadata_json: Record<string, unknown>;
    created_at: string;
  }>;
}> {
  const db = getDb();
  const [leadRows, enrichmentRows, messageRows, eventRows] = await Promise.all([
    db.select().from(leads).where(eq(leads.id, id)).limit(1),
    db.select().from(leadEnrichment).where(eq(leadEnrichment.lead_id, id)).orderBy(desc(leadEnrichment.created_at)).limit(1),
    db.select().from(outreachMessages).where(eq(outreachMessages.lead_id, id)).orderBy(desc(outreachMessages.created_at)),
    db.select().from(outreachEvents).where(eq(outreachEvents.lead_id, id)).orderBy(desc(outreachEvents.created_at)),
  ]);

  return {
    lead: leadRows[0] ? mapLead(leadRows[0]) : null,
    enrichment: (enrichmentRows[0]?.raw_json as Record<string, unknown> | undefined) ?? null,
    messages: messageRows.map(mapOutreachMessage),
    events: eventRows.map((row) => ({
      id: row.id,
      event_type: row.event_type as OutreachEventType,
      metadata_json: (row.metadata_json as Record<string, unknown> | undefined) ?? {},
      created_at: toIso(row.created_at)!,
    })),
  };
}

type LeadInsertPayload = {
  business_name?: string | null;
  category_id?: string | null;
  location_id?: string | null;
  campaign_id?: string | null;
  facebook_url?: string | null;
  website_url?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  source: string;
  status?: LeadStatus;
};

function normalizeContactUrl(value?: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const path = url.pathname.replace(/\/+$/, "").toLowerCase();
    return `${host}${path}`;
  } catch {
    return raw.toLowerCase();
  }
}

function normalizeBusinessName(value?: string | null): string | null {
  const clean = value?.toLowerCase().replace(/\s+/g, " ").trim();
  return clean || null;
}

function toLeadFingerprintKeys(payload: LeadInsertPayload): string[] {
  const keys: string[] = [];
  const website = normalizeContactUrl(payload.website_url);
  const facebook = normalizeContactUrl(payload.facebook_url);
  const phone = normalizePhone(payload.phone);
  const normalizedName = normalizeBusinessName(payload.business_name);

  if (website) keys.push(`w:${website}`);
  if (facebook) keys.push(`f:${facebook}`);
  if (phone.length >= 7) keys.push(`p:${phone}`);
  if (normalizedName && payload.location_id) keys.push(`nl:${normalizedName}:${payload.location_id}`);
  return keys;
}

async function buildLeadFingerprintSet(): Promise<Set<string>> {
  const existing = await getDb()
    .select({
      business_name: leads.business_name,
      location_id: leads.location_id,
      website_url: leads.website_url,
      facebook_url: leads.facebook_url,
      phone: leads.phone,
    })
    .from(leads);

  const seen = new Set<string>();
  for (const item of existing) {
    const keys = toLeadFingerprintKeys({
      business_name: item.business_name,
      location_id: item.location_id,
      website_url: item.website_url,
      facebook_url: item.facebook_url,
      phone: item.phone,
      source: "existing",
    });
    for (const key of keys) seen.add(key);
  }
  return seen;
}

function dedupeLeadPayloads(payload: LeadInsertPayload[], seen: Set<string>): {
  unique: LeadInsertPayload[];
  skippedDuplicates: number;
} {
  const unique: LeadInsertPayload[] = [];
  let skippedDuplicates = 0;

  for (const item of payload) {
    const keys = toLeadFingerprintKeys(item);
    const isDuplicate = keys.length > 0 && keys.some((key) => seen.has(key));
    if (isDuplicate) {
      skippedDuplicates += 1;
      continue;
    }

    unique.push(item);
    for (const key of keys) seen.add(key);
  }

  return { unique, skippedDuplicates };
}

export async function findPotentialLeadDuplicates(payload: {
  business_name?: string | null;
  website_url?: string | null;
  facebook_url?: string | null;
  phone?: string | null;
  location_id?: string | null;
  address?: string | null;
  limit?: number;
}): Promise<
  Array<{
    lead_id: string;
    business_name: string | null;
    address: string | null;
    status: LeadStatus;
    source: string;
    confidence: number;
    reasons: string[];
  }>
> {
  const website = normalizeContactUrl(payload.website_url);
  const facebook = normalizeContactUrl(payload.facebook_url);
  const phone = normalizePhone(payload.phone);
  const normalizedName = normalizeBusinessName(payload.business_name);
  const normalizedAddress = normalizeBusinessName(payload.address);
  const maxItems = Math.max(1, Math.min(20, payload.limit ?? 8));

  if (!website && !facebook && phone.length < 7 && !normalizedName) return [];

  const rows = await getDb()
    .select({
      id: leads.id,
      business_name: leads.business_name,
      website_url: leads.website_url,
      facebook_url: leads.facebook_url,
      phone: leads.phone,
      location_id: leads.location_id,
      address: leads.address,
      status: leads.status,
      source: leads.source,
    })
    .from(leads)
    .orderBy(desc(leads.created_at))
    .limit(2500);

  const candidates: Array<{
    lead_id: string;
    business_name: string | null;
    address: string | null;
    status: LeadStatus;
    source: string;
    confidence: number;
    reasons: string[];
  }> = [];

  for (const row of rows) {
    const reasons: string[] = [];
    let score = 0;

    const rowWebsite = normalizeContactUrl(row.website_url);
    const rowFacebook = normalizeContactUrl(row.facebook_url);
    const rowPhone = normalizePhone(row.phone);
    const rowName = normalizeBusinessName(row.business_name);
    const rowAddress = normalizeBusinessName(row.address);

    if (website && rowWebsite && website === rowWebsite) {
      score += 100;
      reasons.push("Same website");
    }
    if (facebook && rowFacebook && facebook === rowFacebook) {
      score += 96;
      reasons.push("Same Facebook URL");
    }
    if (phone.length >= 7 && rowPhone.length >= 7 && phone === rowPhone) {
      score += 92;
      reasons.push("Same phone number");
    }
    if (normalizedName && rowName && normalizedName === rowName) {
      if (payload.location_id && row.location_id && payload.location_id === row.location_id) {
        score += 78;
        reasons.push("Same business name in same location");
      } else {
        score += 58;
        reasons.push("Same business name");
      }
    }
    if (normalizedAddress && rowAddress && normalizedAddress === rowAddress) {
      score += 18;
      reasons.push("Same address");
    }

    if (score <= 0) continue;
    candidates.push({
      lead_id: row.id,
      business_name: row.business_name,
      address: row.address,
      status: row.status as LeadStatus,
      source: row.source,
      confidence: Math.max(1, Math.min(100, score)),
      reasons: Array.from(new Set(reasons)),
    });
  }

  return candidates.sort((a, b) => b.confidence - a.confidence).slice(0, maxItems);
}

export async function createLead(payload: {
  business_name?: string;
  category_id?: string | null;
  location_id?: string | null;
  campaign_id?: string | null;
  facebook_url?: string | null;
  website_url?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  source: string;
  status?: LeadStatus;
}): Promise<Lead> {
  const seen = await buildLeadFingerprintSet();
  const payloadKeys = toLeadFingerprintKeys({
    ...payload,
  });
  const { unique } = dedupeLeadPayloads(
    [
      {
        ...payload,
      },
    ],
    seen,
  );
  if (!unique.length) {
    const existingRows = await getDb().select().from(leads).orderBy(desc(leads.created_at)).limit(1200);
    const existing = existingRows.find((row) => {
      const existingKeys = toLeadFingerprintKeys({
        business_name: row.business_name,
        location_id: row.location_id,
        website_url: row.website_url,
        facebook_url: row.facebook_url,
        phone: row.phone,
        source: row.source,
      });
      return existingKeys.some((key) => payloadKeys.includes(key));
    });
    if (existing) {
      return mapLead(existing);
    }
    throw new Error("Lead already exists (duplicate website, Facebook, phone, or business name in same location).");
  }

  const rows = await getDb().insert(leads).values(unique[0]).returning();
  if (!rows[0]) {
    throw new Error("Failed to create lead.");
  }
  return mapLead(rows[0]);
}

export async function bulkCreateLeadsWithStats(payload: LeadInsertPayload[]): Promise<{
  inserted: Lead[];
  skippedDuplicates: number;
}> {
  if (!payload.length) return { inserted: [], skippedDuplicates: 0 };
  const seen = await buildLeadFingerprintSet();
  const deduped = dedupeLeadPayloads(payload, seen);
  if (!deduped.unique.length) {
    return { inserted: [], skippedDuplicates: deduped.skippedDuplicates };
  }

  const rows = await getDb().insert(leads).values(deduped.unique).returning();
  return {
    inserted: rows.map(mapLead),
    skippedDuplicates: deduped.skippedDuplicates,
  };
}

export async function bulkCreateLeads(payload: LeadInsertPayload[]): Promise<Lead[]> {
  const result = await bulkCreateLeadsWithStats(payload);
  return result.inserted;
}

export async function insertLeadEnrichment(payload: {
  lead_id: string;
  raw_json: Record<string, unknown>;
  detected_keywords: string[];
}): Promise<void> {
  await getDb().insert(leadEnrichment).values(payload);
}

export async function saveScores(payload: {
  leadId: string;
  scoreHeuristic: number;
  scoreAi: number;
  scoreTotal: number;
}): Promise<void> {
  await getDb()
    .update(leads)
    .set({
      score_heuristic: payload.scoreHeuristic,
      score_ai: payload.scoreAi,
      score_total: payload.scoreTotal,
    })
    .where(eq(leads.id, payload.leadId));
}

export async function createOutreachMessages(
  leadId: string,
  messages: Array<{
    language: string;
    angle: string;
    variant_label: "A" | "B" | "C";
    message_text: string;
    message_kind?: "initial" | "follow_up";
  }>,
  options?: { replaceExisting?: boolean; messageKind?: "initial" | "follow_up" },
): Promise<void> {
  const db = getDb();
  if (options?.replaceExisting ?? true) {
    if (options?.messageKind) {
      await db
        .delete(outreachMessages)
        .where(and(eq(outreachMessages.lead_id, leadId), eq(outreachMessages.message_kind, options.messageKind)));
    } else {
      await db.delete(outreachMessages).where(eq(outreachMessages.lead_id, leadId));
    }
  }
  if (!messages.length) return;
  await db.insert(outreachMessages).values(
    messages.map((message) => ({
      lead_id: leadId,
      language: message.language as (typeof outreachMessages.$inferInsert)["language"],
      angle: message.angle as (typeof outreachMessages.$inferInsert)["angle"],
      variant_label: message.variant_label,
      message_kind: (message.message_kind ?? options?.messageKind ?? "initial") as "initial" | "follow_up",
      message_text: sanitizeOutreachText(message.message_text),
    })),
  );
}

export async function logOutreachEvent(payload: {
  lead_id: string;
  event_type: OutreachEventType;
  metadata_json?: Record<string, unknown>;
}): Promise<void> {
  await getDb().insert(outreachEvents).values({
    lead_id: payload.lead_id,
    event_type: payload.event_type,
    metadata_json: payload.metadata_json ?? {},
  });
}

export async function updateLeadStatus(leadId: string, status: LeadStatus): Promise<void> {
  const patch: Partial<typeof leads.$inferInsert> = { status };
  if (status === "SENT") {
    patch.last_contacted_at = new Date();
  }

  await getDb().update(leads).set(patch).where(eq(leads.id, leadId));
}

export async function updateLeadContactData(payload: {
  leadId: string;
  facebook_url?: string | null;
  email?: string | null;
}): Promise<void> {
  const patch: Partial<typeof leads.$inferInsert> = {};
  if (payload.facebook_url !== undefined) {
    patch.facebook_url = payload.facebook_url;
  }
  if (payload.email !== undefined) {
    patch.email = payload.email;
  }

  if (Object.keys(patch).length === 0) return;
  await getDb().update(leads).set(patch).where(eq(leads.id, payload.leadId));
}

export async function listLeadsNeedingContactRefresh(options: {
  daysStale: number;
  limit: number;
}): Promise<Lead[]> {
  const daysStale = Math.max(1, Math.min(180, options.daysStale));
  const limit = Math.max(1, Math.min(200, options.limit));
  const cutoffDate = new Date(Date.now() - daysStale * 24 * 60 * 60 * 1000);

  const db = getDb();
  const [leadRows, enrichmentRows] = await Promise.all([
    db
      .select()
      .from(leads)
      .where(ilike(leads.website_url, "http%"))
      .orderBy(desc(leads.created_at))
      .limit(2000),
    db
      .select({
        lead_id: leadEnrichment.lead_id,
        latest: max(leadEnrichment.created_at),
      })
      .from(leadEnrichment)
      .groupBy(leadEnrichment.lead_id),
  ]);

  const latestEnrichment = new Map(
    enrichmentRows.map((item) => [
      item.lead_id,
      item.latest ? (item.latest instanceof Date ? item.latest : new Date(item.latest)) : null,
    ]),
  );

  const stale = leadRows.filter((row) => {
    const last = latestEnrichment.get(row.id);
    if (!last) return true;
    return last < cutoffDate;
  });

  return stale.slice(0, limit).map(mapLead);
}

export async function mergeDuplicateLeads(options?: {
  limit?: number;
}): Promise<{ merged: number; checked: number }> {
  const limit = Math.max(1, Math.min(1000, options?.limit ?? 300));
  const db = getDb();
  const rows = await db.select().from(leads).orderBy(asc(leads.created_at)).limit(4000);
  const keysToMaster = new Map<string, typeof leads.$inferSelect>();
  let merged = 0;

  for (const row of rows) {
    if (merged >= limit) break;
    const keys = toLeadFingerprintKeys({
      business_name: row.business_name,
      location_id: row.location_id,
      website_url: row.website_url,
      facebook_url: row.facebook_url,
      phone: row.phone,
      source: row.source,
    });

    const master = keys.map((key) => keysToMaster.get(key)).find(Boolean) ?? null;
    if (!master) {
      for (const key of keys) keysToMaster.set(key, row);
      continue;
    }
    if (master.id === row.id) continue;

    const patch: Partial<typeof leads.$inferInsert> = {
      business_name: master.business_name ?? row.business_name,
      category_id: master.category_id ?? row.category_id,
      location_id: master.location_id ?? row.location_id,
      campaign_id: master.campaign_id ?? row.campaign_id,
      facebook_url: master.facebook_url ?? row.facebook_url,
      website_url: master.website_url ?? row.website_url,
      phone: master.phone ?? row.phone,
      email: master.email ?? row.email,
      address: master.address ?? row.address,
      score_heuristic: master.score_heuristic ?? row.score_heuristic,
      score_ai: master.score_ai ?? row.score_ai,
      score_total: master.score_total ?? row.score_total,
      last_contacted_at: master.last_contacted_at ?? row.last_contacted_at,
    };

    await db.update(leads).set(patch).where(eq(leads.id, master.id));
    await db.update(outreachMessages).set({ lead_id: master.id }).where(eq(outreachMessages.lead_id, row.id));
    await db.update(outreachEvents).set({ lead_id: master.id }).where(eq(outreachEvents.lead_id, row.id));
    await db.update(leadEnrichment).set({ lead_id: master.id }).where(eq(leadEnrichment.lead_id, row.id));
    await db.delete(leads).where(eq(leads.id, row.id));

    merged += 1;
    const updatedMaster = { ...master, ...patch };
    for (const key of keys) {
      keysToMaster.set(key, updatedMaster);
    }
  }

  return {
    merged,
    checked: rows.length,
  };
}

export async function getScoreWeights(): Promise<ScoreWeights> {
  const row = await getDb().select({ value_json: appSettings.value_json }).from(appSettings).where(eq(appSettings.key, "scoring_weights")).limit(1);
  const raw = row[0]?.value_json as ScoreWeights | undefined;
  if (!raw) return DEFAULT_WEIGHTS;
  if (typeof raw.heuristic !== "number" || typeof raw.ai !== "number") return DEFAULT_WEIGHTS;
  return raw;
}

export async function setScoreWeights(weights: ScoreWeights): Promise<void> {
  await getDb()
    .insert(appSettings)
    .values({ key: "scoring_weights", value_json: weights })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value_json: weights,
      },
    });
}

export async function addCategory(name: string, defaultAngle: string): Promise<void> {
  await getDb()
    .insert(categories)
    .values({
      name,
      default_angle: defaultAngle as MessageAngle,
    })
    .onConflictDoUpdate({
      target: categories.name,
      set: {
        default_angle: defaultAngle as MessageAngle,
      },
    });
}

export async function addLocation(payload: {
  name: string;
  city?: string;
  region?: string;
  country?: string;
}): Promise<void> {
  await getDb()
    .insert(locations)
    .values({
      name: payload.name,
      city: payload.city || null,
      region: payload.region || null,
      country: payload.country || "Philippines",
    })
    .onConflictDoUpdate({
      target: locations.name,
      set: {
        city: payload.city || null,
        region: payload.region || null,
        country: payload.country || "Philippines",
      },
    });
}

export async function setKeywordPack(categoryId: string, keywords: string[]): Promise<void> {
  const row = await getDb().select({ id: keywordPacks.id }).from(keywordPacks).where(eq(keywordPacks.category_id, categoryId)).limit(1);
  if (row[0]) {
    await getDb().update(keywordPacks).set({ keywords }).where(eq(keywordPacks.id, row[0].id));
    return;
  }
  await getDb().insert(keywordPacks).values({
    category_id: categoryId,
    keywords,
  });
}

function computePriorityScore(lead: Lead, campaign?: Campaign | null): number {
  let score = 0;
  score += lead.quality_score * 0.42;
  score += (lead.score_total ?? 50) * 0.34;

  if (lead.status === "NEW") score += 16;
  if (lead.status === "DRAFTED") score += 10;
  if (lead.status === "SENT") score -= 14;
  if (["REPLIED", "QUALIFIED", "WON", "LOST"].includes(lead.status)) score -= 24;

  const createdAgeHours = (Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60);
  if (createdAgeHours <= 72) score += 8;
  if (lead.facebook_url) score += 4;
  if (lead.phone) score += 2;

  if (campaign) {
    if (campaign.category_id && campaign.category_id === lead.category_id) score += 5;
    if (campaign.location_id && campaign.location_id === lead.location_id) score += 5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function assignLeadsToCampaignAuto(payload: {
  campaignId: string;
  autoOnly: boolean;
  includeStatuses: LeadStatus[];
  limit: number;
}): Promise<{ assigned: number; skipped: number }> {
  const campaign = await getCampaignById(payload.campaignId);
  if (!campaign) throw new Error("Campaign not found.");
  const limit = Math.max(1, Math.min(500, payload.limit));

  const candidates = await listLeads({
    sort: "highest_quality",
  });

  const filtered = candidates
    .filter((lead) => payload.includeStatuses.includes(lead.status))
    .filter((lead) => (payload.autoOnly ? !lead.campaign_id : true))
    .filter((lead) => (campaign.category_id ? lead.category_id === campaign.category_id : true))
    .filter((lead) => (campaign.location_id ? lead.location_id === campaign.location_id : true))
    .filter((lead) => lead.quality_score >= campaign.min_quality_score)
    .slice(0, limit);

  await Promise.all(
    filtered.map((lead) =>
      getDb()
        .update(leads)
        .set({ campaign_id: campaign.id })
        .where(eq(leads.id, lead.id)),
    ),
  );

  return {
    assigned: filtered.length,
    skipped: Math.max(0, candidates.length - filtered.length),
  };
}

export async function getPriorityLeads(options?: {
  limit?: number;
  campaignId?: string;
}): Promise<
  Array<{
    lead: Lead;
    priority_score: number;
    priority_reason: string;
  }>
> {
  const limit = Math.max(1, Math.min(200, options?.limit ?? 20));
  const [campaign, leadsData] = await Promise.all([
    options?.campaignId ? getCampaignById(options.campaignId) : Promise.resolve(null),
    listLeads({
      campaignId: options?.campaignId,
      sort: "highest_quality",
    }),
  ]);

  return leadsData
    .filter((lead) => ["NEW", "DRAFTED", "SENT"].includes(lead.status))
    .map((lead) => {
      const score = computePriorityScore(lead, campaign);
      const reason =
        lead.quality_tier === "High"
          ? "High quality profile with good contact channels."
          : lead.status === "NEW"
            ? "Fresh lead not yet contacted."
            : lead.status === "SENT"
              ? "Already sent; prioritize only if follow-up is due."
              : "Promising lead for next outreach batch.";
      return {
        lead,
        priority_score: score,
        priority_reason: reason,
      };
    })
    .sort((a, b) => b.priority_score - a.priority_score)
    .slice(0, limit);
}

export async function getTodayQueueItems(options?: {
  limit?: number;
  campaignId?: string;
}): Promise<
  Array<{
    lead: Lead;
    campaign_name: string | null;
    priority_score: number;
    priority_reason: string;
    next_action: "send_initial" | "send_follow_up" | "review";
    suggested_message: string | null;
    suggested_variant: "A" | "B" | "C" | null;
    suggested_kind: "initial" | "follow_up" | null;
  }>
> {
  const prioritized = await getPriorityLeads({
    limit: options?.limit ?? 30,
    campaignId: options?.campaignId,
  });
  if (!prioritized.length) return [];

  const leadIds = prioritized.map((item) => item.lead.id);
  const campaignIds = prioritized.map((item) => item.lead.campaign_id).filter((value): value is string => Boolean(value));
  const [messageRows, campaignsRows] = await Promise.all([
    getDb()
      .select()
      .from(outreachMessages)
      .where(inArray(outreachMessages.lead_id, leadIds))
      .orderBy(desc(outreachMessages.created_at)),
    campaignIds.length ? getDb().select().from(campaigns).where(inArray(campaigns.id, campaignIds)) : Promise.resolve([]),
  ]);

  const campaignName = new Map(campaignsRows.map((row) => [row.id, row.name]));
  const messagesByLead = new Map<string, typeof outreachMessages.$inferSelect[]>();
  for (const row of messageRows) {
    const arr = messagesByLead.get(row.lead_id) ?? [];
    arr.push(row);
    messagesByLead.set(row.lead_id, arr);
  }

  function pickMessage(lead: Lead): typeof outreachMessages.$inferSelect | null {
    const list = messagesByLead.get(lead.id) ?? [];
    if (!list.length) return null;
    if (lead.status === "SENT") {
      return (
        list.find((item) => item.message_kind === "follow_up" && item.variant_label === "A") ??
        list.find((item) => item.message_kind === "follow_up") ??
        list.find((item) => item.message_kind === "initial" && item.variant_label === "A") ??
        list[0]
      );
    }
    return (
      list.find((item) => item.message_kind === "initial" && item.variant_label === "A") ??
      list.find((item) => item.message_kind === "initial") ??
      list[0]
    );
  }

  return prioritized.map((item) => {
    const suggested = pickMessage(item.lead);
    const sentHoursAgo = item.lead.last_contacted_at
      ? (Date.now() - new Date(item.lead.last_contacted_at).getTime()) / (1000 * 60 * 60)
      : null;
    const nextAction: "send_initial" | "send_follow_up" | "review" =
      item.lead.status === "SENT"
        ? sentHoursAgo !== null && sentHoursAgo >= 72
          ? "send_follow_up"
          : "review"
        : ["NEW", "DRAFTED"].includes(item.lead.status)
          ? "send_initial"
          : "review";

    return {
      lead: item.lead,
      campaign_name: item.lead.campaign_id ? campaignName.get(item.lead.campaign_id) ?? null : null,
      priority_score: item.priority_score,
      priority_reason: item.priority_reason,
      next_action: nextAction,
      suggested_message: suggested?.message_text ?? null,
      suggested_variant: (suggested?.variant_label as "A" | "B" | "C" | undefined) ?? null,
      suggested_kind: (suggested?.message_kind as "initial" | "follow_up" | undefined) ?? null,
    };
  });
}

export async function listFollowUpCandidates(options?: {
  campaignId?: string;
  daysSinceSent?: number;
  limit?: number;
}): Promise<Array<{ lead: Lead; campaign: Campaign | null }>> {
  const days = Math.max(1, Math.min(30, options?.daysSinceSent ?? 3));
  const limit = Math.max(1, Math.min(300, options?.limit ?? 60));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const where = and(
    eq(leads.status, "SENT"),
    options?.campaignId ? eq(leads.campaign_id, options.campaignId) : undefined,
  );
  const rows = await getDb()
    .select()
    .from(leads)
    .where(where)
    .orderBy(desc(leads.last_contacted_at), desc(leads.created_at))
    .limit(1000);

  const staleSent = rows.filter((row) => {
    if (!row.last_contacted_at) return false;
    const sentAt = row.last_contacted_at instanceof Date ? row.last_contacted_at : new Date(row.last_contacted_at);
    return sentAt <= cutoff;
  });

  if (!staleSent.length) return [];

  const followUpRows = await getDb()
    .select({
      lead_id: outreachMessages.lead_id,
    })
    .from(outreachMessages)
    .where(and(eq(outreachMessages.message_kind, "follow_up"), inArray(outreachMessages.lead_id, staleSent.map((row) => row.id))));
  const withFollowUp = new Set(followUpRows.map((row) => row.lead_id));

  const campaignsData = await getCampaigns({ status: "ALL" });
  const campaignMap = new Map(campaignsData.map((campaign) => [campaign.id, campaign]));

  return staleSent
    .filter((row) => !withFollowUp.has(row.id))
    .slice(0, limit)
    .map((row) => ({
      lead: mapLead(row),
      campaign: row.campaign_id ? campaignMap.get(row.campaign_id) ?? null : null,
    }));
}

export async function getCampaignFunnelAnalytics(): Promise<
  Array<{
    campaign_id: string;
    campaign_name: string;
    sent: number;
    replied: number;
    qualified: number;
    won: number;
    reply_rate: number;
    win_rate: number;
    avg_reply_hours: number | null;
  }>
> {
  const [campaignRows, leadRows] = await Promise.all([
    getCampaigns({ status: "ALL" }),
    getDb().select().from(leads),
  ]);

  const leadIdsByCampaign = new Map<string, string[]>();
  for (const row of leadRows) {
    if (!row.campaign_id) continue;
    const arr = leadIdsByCampaign.get(row.campaign_id) ?? [];
    arr.push(row.id);
    leadIdsByCampaign.set(row.campaign_id, arr);
  }

  const allCampaignLeadIds = Array.from(leadIdsByCampaign.values()).flat();
  const replyEvents = allCampaignLeadIds.length
    ? await getDb()
        .select({
          lead_id: outreachEvents.lead_id,
          created_at: outreachEvents.created_at,
        })
        .from(outreachEvents)
        .where(and(eq(outreachEvents.event_type, "REPLIED"), inArray(outreachEvents.lead_id, allCampaignLeadIds)))
        .orderBy(asc(outreachEvents.created_at))
    : [];

  const firstReplyAt = new Map<string, Date>();
  for (const event of replyEvents) {
    if (!firstReplyAt.has(event.lead_id)) {
      firstReplyAt.set(event.lead_id, event.created_at instanceof Date ? event.created_at : new Date(event.created_at));
    }
  }

  return campaignRows.map((campaign) => {
    const campaignLeads = leadRows.filter((lead) => lead.campaign_id === campaign.id);
    const sent = campaignLeads.filter((lead) => ["SENT", "REPLIED", "QUALIFIED", "WON", "LOST"].includes(lead.status)).length;
    const replied = campaignLeads.filter((lead) => ["REPLIED", "QUALIFIED", "WON", "LOST"].includes(lead.status)).length;
    const qualified = campaignLeads.filter((lead) => ["QUALIFIED", "WON", "LOST"].includes(lead.status)).length;
    const won = campaignLeads.filter((lead) => lead.status === "WON").length;
    const reply_rate = sent > 0 ? replied / sent : 0;
    const win_rate = qualified > 0 ? won / qualified : 0;

    const replyHours = campaignLeads
      .map((lead) => {
        const repliedAt = firstReplyAt.get(lead.id);
        if (!lead.last_contacted_at || !repliedAt) return null;
        const sentAt = lead.last_contacted_at instanceof Date ? lead.last_contacted_at : new Date(lead.last_contacted_at);
        return (repliedAt.getTime() - sentAt.getTime()) / (1000 * 60 * 60);
      })
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);

    const avg_reply_hours =
      replyHours.length > 0 ? Number((replyHours.reduce((sum, value) => sum + value, 0) / replyHours.length).toFixed(1)) : null;

    return {
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      sent,
      replied,
      qualified,
      won,
      reply_rate,
      win_rate,
      avg_reply_hours,
    };
  });
}

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const leadsData = await listLeads();
  const total = leadsData.length;
  const drafted = leadsData.filter((lead) => lead.status === "DRAFTED").length;
  const sent = leadsData.filter((lead) => lead.status === "SENT").length;
  const replies = leadsData.filter((lead) => lead.status === "REPLIED").length;
  const qualified = leadsData.filter((lead) => lead.status === "QUALIFIED").length;
  const won = leadsData.filter((lead) => lead.status === "WON").length;
  const replyRate = sent > 0 ? replies / sent : 0;
  const winRate = qualified > 0 ? won / qualified : 0;
  return {
    totalLeads: total,
    drafted,
    sent,
    replies,
    qualified,
    won,
    replyRate,
    winRate,
  };
}

export async function getBreakdowns(): Promise<{
  byCategory: Record<string, number>;
  byLocation: Record<string, number>;
  byCampaign: Record<string, number>;
  byStatus: Record<LeadStatus, number>;
  byAngle: Record<string, number>;
  byLanguage: Record<string, number>;
  byVariant: Record<string, number>;
}> {
  const [leadsData, categoriesData, locationsData, campaignsData, messages] = await Promise.all([
    listLeads(),
    getCategories(),
    getLocations(),
    getCampaigns({ status: "ALL" }),
    getDb()
      .select({
        angle: outreachMessages.angle,
        language: outreachMessages.language,
        variant_label: outreachMessages.variant_label,
      })
      .from(outreachMessages),
  ]);

  const categoryMap = new Map(categoriesData.map((category) => [category.id, category.name]));
  const locationMap = new Map(locationsData.map((location) => [location.id, location.name]));
  const campaignMap = new Map(campaignsData.map((campaign) => [campaign.id, campaign.name]));

  const byCategory: Record<string, number> = {};
  const byLocation: Record<string, number> = {};
  const byCampaign: Record<string, number> = {};
  const byStatus: Record<LeadStatus, number> = {
    NEW: 0,
    DRAFTED: 0,
    SENT: 0,
    REPLIED: 0,
    QUALIFIED: 0,
    WON: 0,
    LOST: 0,
  };
  const byAngle: Record<string, number> = {};
  const byLanguage: Record<string, number> = {};
  const byVariant: Record<string, number> = {};

  for (const lead of leadsData) {
    byStatus[lead.status] += 1;
    const category = lead.category_id ? categoryMap.get(lead.category_id) ?? "Unassigned" : "Unassigned";
    const location = lead.location_id ? locationMap.get(lead.location_id) ?? "Unassigned" : "Unassigned";
    const campaign = lead.campaign_id ? campaignMap.get(lead.campaign_id) ?? "Unassigned" : "Unassigned";
    byCategory[category] = (byCategory[category] ?? 0) + 1;
    byLocation[location] = (byLocation[location] ?? 0) + 1;
    byCampaign[campaign] = (byCampaign[campaign] ?? 0) + 1;
  }

  for (const message of messages) {
    byAngle[message.angle] = (byAngle[message.angle] ?? 0) + 1;
    byLanguage[message.language] = (byLanguage[message.language] ?? 0) + 1;
    byVariant[message.variant_label] = (byVariant[message.variant_label] ?? 0) + 1;
  }

  return { byCategory, byLocation, byCampaign, byStatus, byAngle, byLanguage, byVariant };
}

export async function getBestVariantByCategory(): Promise<Array<{ category: string; bestVariant: string; sent: number; won: number }>> {
  const [leadsRows, messages, categoriesData] = await Promise.all([
    getDb().select({ id: leads.id, category_id: leads.category_id, status: leads.status }).from(leads),
    getDb()
      .select({ lead_id: outreachMessages.lead_id, variant_label: outreachMessages.variant_label })
      .from(outreachMessages)
      .where(eq(outreachMessages.message_kind, "initial")),
    getCategories(),
  ]);

  const categoryNames = new Map(categoriesData.map((category) => [category.id, category.name]));
  const leadMap = new Map(leadsRows.map((lead) => [lead.id, lead]));
  const stats = new Map<string, Record<string, { sent: number; won: number }>>();

  for (const message of messages) {
    const lead = leadMap.get(message.lead_id);
    if (!lead) continue;
    const categoryKey = lead.category_id ?? "unassigned";
    const variant = message.variant_label;
    const categoryStats = stats.get(categoryKey) ?? {};
    categoryStats[variant] = categoryStats[variant] ?? { sent: 0, won: 0 };
    if (["SENT", "REPLIED", "QUALIFIED", "WON"].includes(lead.status)) {
      categoryStats[variant].sent += 1;
    }
    if (lead.status === "WON") {
      categoryStats[variant].won += 1;
    }
    stats.set(categoryKey, categoryStats);
  }

  const result: Array<{ category: string; bestVariant: string; sent: number; won: number }> = [];
  for (const [categoryId, variants] of stats.entries()) {
    const best = Object.entries(variants)
      .sort((a, b) => {
        const va = a[1];
        const vb = b[1];
        const ra = va.sent > 0 ? va.won / va.sent : 0;
        const rb = vb.sent > 0 ? vb.won / vb.sent : 0;
        return rb - ra;
      })
      .at(0);

    if (!best) continue;
    result.push({
      category: categoryNames.get(categoryId) ?? "Unassigned",
      bestVariant: best[0],
      sent: best[1].sent,
      won: best[1].won,
    });
  }

  return result;
}

export async function getRecommendedMessageStrategiesByCategory(): Promise<
  Array<{
    category: string;
    language: MessageLanguage;
    tone: MessageTone | "Mixed";
    angle: MessageAngle;
    variant: "A" | "B" | "C";
    sent: number;
    replies: number;
    won: number;
    reply_rate: number;
    win_rate: number;
    score: number;
  }>
> {
  const [leadsRows, messageRows, campaignRows, categoriesData] = await Promise.all([
    getDb().select({ id: leads.id, category_id: leads.category_id, status: leads.status, campaign_id: leads.campaign_id }).from(leads),
    getDb()
      .select({
        lead_id: outreachMessages.lead_id,
        language: outreachMessages.language,
        angle: outreachMessages.angle,
        variant_label: outreachMessages.variant_label,
        message_kind: outreachMessages.message_kind,
      })
      .from(outreachMessages)
      .where(eq(outreachMessages.message_kind, "initial")),
    getCampaigns({ status: "ALL" }),
    getCategories(),
  ]);

  const leadById = new Map(leadsRows.map((row) => [row.id, row]));
  const campaignById = new Map(campaignRows.map((row) => [row.id, row]));
  const categoryName = new Map(categoriesData.map((row) => [row.id, row.name]));

  type Bucket = {
    category: string;
    language: MessageLanguage;
    tone: MessageTone | "Mixed";
    angle: MessageAngle;
    variant: "A" | "B" | "C";
    sent: number;
    replies: number;
    won: number;
  };
  const buckets = new Map<string, Bucket>();

  for (const message of messageRows) {
    const lead = leadById.get(message.lead_id);
    if (!lead || !lead.category_id) continue;

    const category = categoryName.get(lead.category_id) ?? "Unassigned";
    const tone = lead.campaign_id ? campaignById.get(lead.campaign_id)?.tone ?? "Mixed" : "Mixed";
    const key = [lead.category_id, message.language, tone, message.angle, message.variant_label].join("|");
    const bucket = buckets.get(key) ?? {
      category,
      language: message.language as MessageLanguage,
      tone,
      angle: message.angle as MessageAngle,
      variant: message.variant_label as "A" | "B" | "C",
      sent: 0,
      replies: 0,
      won: 0,
    };

    if (["SENT", "REPLIED", "QUALIFIED", "WON", "LOST"].includes(lead.status)) {
      bucket.sent += 1;
    }
    if (["REPLIED", "QUALIFIED", "WON", "LOST"].includes(lead.status)) {
      bucket.replies += 1;
    }
    if (lead.status === "WON") {
      bucket.won += 1;
    }

    buckets.set(key, bucket);
  }

  const byCategory = new Map<string, Array<Bucket & { reply_rate: number; win_rate: number; score: number }>>();
  for (const bucket of buckets.values()) {
    if (bucket.sent < 2) continue;
    const replyRate = bucket.sent > 0 ? bucket.replies / bucket.sent : 0;
    const winRate = bucket.sent > 0 ? bucket.won / bucket.sent : 0;
    const confidence = Math.min(1, bucket.sent / 20);
    const score = (replyRate * 0.62 + winRate * 0.38) * (0.75 + confidence * 0.25);

    const enriched = {
      ...bucket,
      reply_rate: replyRate,
      win_rate: winRate,
      score,
    };
    const list = byCategory.get(bucket.category) ?? [];
    list.push(enriched);
    byCategory.set(bucket.category, list);
  }

  const result: Array<{
    category: string;
    language: MessageLanguage;
    tone: MessageTone | "Mixed";
    angle: MessageAngle;
    variant: "A" | "B" | "C";
    sent: number;
    replies: number;
    won: number;
    reply_rate: number;
    win_rate: number;
    score: number;
  }> = [];

  for (const [category, items] of byCategory.entries()) {
    const best = items
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.sent !== a.sent) return b.sent - a.sent;
        return b.reply_rate - a.reply_rate;
      })
      .at(0);
    if (!best) continue;
    result.push({
      category,
      language: best.language,
      tone: best.tone,
      angle: best.angle,
      variant: best.variant,
      sent: best.sent,
      replies: best.replies,
      won: best.won,
      reply_rate: best.reply_rate,
      win_rate: best.win_rate,
      score: best.score,
    });
  }

  return result.sort((a, b) => b.score - a.score).slice(0, 20);
}

export async function getRecommendedMessageStrategiesByCategoryLocation(): Promise<
  Array<{
    category: string;
    location: string;
    language: MessageLanguage;
    tone: MessageTone | "Mixed";
    angle: MessageAngle;
    variant: "A" | "B" | "C";
    sent: number;
    replies: number;
    won: number;
    reply_rate: number;
    win_rate: number;
    score: number;
  }>
> {
  const [leadsRows, messageRows, campaignRows, categoriesData, locationsData] = await Promise.all([
    getDb().select({ id: leads.id, category_id: leads.category_id, location_id: leads.location_id, status: leads.status, campaign_id: leads.campaign_id }).from(leads),
    getDb()
      .select({
        lead_id: outreachMessages.lead_id,
        language: outreachMessages.language,
        angle: outreachMessages.angle,
        variant_label: outreachMessages.variant_label,
        message_kind: outreachMessages.message_kind,
      })
      .from(outreachMessages)
      .where(eq(outreachMessages.message_kind, "initial")),
    getCampaigns({ status: "ALL" }),
    getCategories(),
    getLocations(),
  ]);

  const leadById = new Map(leadsRows.map((row) => [row.id, row]));
  const campaignById = new Map(campaignRows.map((row) => [row.id, row]));
  const categoryName = new Map(categoriesData.map((row) => [row.id, row.name]));
  const locationName = new Map(locationsData.map((row) => [row.id, row.name]));

  type Bucket = {
    category: string;
    location: string;
    language: MessageLanguage;
    tone: MessageTone | "Mixed";
    angle: MessageAngle;
    variant: "A" | "B" | "C";
    sent: number;
    replies: number;
    won: number;
  };
  const buckets = new Map<string, Bucket>();

  for (const message of messageRows) {
    const lead = leadById.get(message.lead_id);
    if (!lead || !lead.category_id || !lead.location_id) continue;

    const category = categoryName.get(lead.category_id) ?? "Unassigned";
    const location = locationName.get(lead.location_id) ?? "Unassigned";
    const tone = lead.campaign_id ? campaignById.get(lead.campaign_id)?.tone ?? "Mixed" : "Mixed";
    const key = [lead.category_id, lead.location_id, message.language, tone, message.angle, message.variant_label].join("|");
    const bucket = buckets.get(key) ?? {
      category,
      location,
      language: message.language as MessageLanguage,
      tone,
      angle: message.angle as MessageAngle,
      variant: message.variant_label as "A" | "B" | "C",
      sent: 0,
      replies: 0,
      won: 0,
    };

    if (["SENT", "REPLIED", "QUALIFIED", "WON", "LOST"].includes(lead.status)) {
      bucket.sent += 1;
    }
    if (["REPLIED", "QUALIFIED", "WON", "LOST"].includes(lead.status)) {
      bucket.replies += 1;
    }
    if (lead.status === "WON") {
      bucket.won += 1;
    }

    buckets.set(key, bucket);
  }

  const byCategoryLocation = new Map<string, Array<Bucket & { reply_rate: number; win_rate: number; score: number }>>();
  for (const bucket of buckets.values()) {
    if (bucket.sent < 2) continue;
    const replyRate = bucket.sent > 0 ? bucket.replies / bucket.sent : 0;
    const winRate = bucket.sent > 0 ? bucket.won / bucket.sent : 0;
    const confidence = Math.min(1, bucket.sent / 18);
    const score = (replyRate * 0.58 + winRate * 0.42) * (0.72 + confidence * 0.28);

    const enriched = {
      ...bucket,
      reply_rate: replyRate,
      win_rate: winRate,
      score,
    };
    const list = byCategoryLocation.get(`${bucket.category}|${bucket.location}`) ?? [];
    list.push(enriched);
    byCategoryLocation.set(`${bucket.category}|${bucket.location}`, list);
  }

  const result: Array<{
    category: string;
    location: string;
    language: MessageLanguage;
    tone: MessageTone | "Mixed";
    angle: MessageAngle;
    variant: "A" | "B" | "C";
    sent: number;
    replies: number;
    won: number;
    reply_rate: number;
    win_rate: number;
    score: number;
  }> = [];

  for (const [, items] of byCategoryLocation.entries()) {
    const best = items
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.sent !== a.sent) return b.sent - a.sent;
        return b.reply_rate - a.reply_rate;
      })
      .at(0);
    if (!best) continue;
    result.push(best);
  }

  return result.sort((a, b) => b.score - a.score).slice(0, 24);
}

export async function getNicheRecommendations(): Promise<
  Array<{
    location: string;
    category: string;
    replyRate: number;
    winRate: number;
    score: number;
  }>
> {
  const [leadsData, categoriesData, locationsData] = await Promise.all([listLeads(), getCategories(), getLocations()]);

  const categoryName = new Map(categoriesData.map((category) => [category.id, category.name]));
  const locationName = new Map(locationsData.map((location) => [location.id, location.name]));

  const stats = new Map<
    string,
    {
      location: string;
      category: string;
      sent: number;
      replied: number;
      qualified: number;
      won: number;
    }
  >();

  for (const lead of leadsData) {
    if (!lead.category_id || !lead.location_id) continue;
    const loc = locationName.get(lead.location_id) ?? "Unassigned";
    const cat = categoryName.get(lead.category_id) ?? "Unassigned";
    const key = `${lead.location_id}:${lead.category_id}`;
    const item = stats.get(key) ?? {
      location: loc,
      category: cat,
      sent: 0,
      replied: 0,
      qualified: 0,
      won: 0,
    };

    if (["SENT", "REPLIED", "QUALIFIED", "WON", "LOST"].includes(lead.status)) item.sent += 1;
    if (["REPLIED", "QUALIFIED", "WON", "LOST"].includes(lead.status)) item.replied += 1;
    if (["QUALIFIED", "WON", "LOST"].includes(lead.status)) item.qualified += 1;
    if (lead.status === "WON") item.won += 1;
    stats.set(key, item);
  }

  return Array.from(stats.values())
    .map((item) => {
      const replyRate = item.sent > 0 ? item.replied / item.sent : 0;
      const winRate = item.qualified > 0 ? item.won / item.qualified : 0;
      return {
        location: item.location,
        category: item.category,
        replyRate,
        winRate,
        score: replyRate * 0.6 + winRate * 0.4,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}
