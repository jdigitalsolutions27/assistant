import "server-only";

import { and, asc, desc, eq, ilike } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  appSettings,
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
import type {
  Category,
  DashboardKpis,
  KeywordPack,
  Lead,
  LeadStatus,
  Location,
  MessageAngle,
  MessageTemplate,
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
  return {
    id: row.id,
    business_name: row.business_name,
    category_id: row.category_id,
    location_id: row.location_id,
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
    message_text: row.message_text,
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

export async function getProspectingConfigs(): Promise<ProspectingConfig[]> {
  const rows = await getDb().select().from(prospectingConfigs).orderBy(desc(prospectingConfigs.created_at));
  return rows.map(mapProspectingConfig);
}

export async function saveProspectingConfig(payload: Omit<ProspectingConfig, "id" | "created_at">): Promise<void> {
  await getDb().insert(prospectingConfigs).values(payload);
}

export async function listLeads(filters?: {
  status?: LeadStatus;
  categoryId?: string;
  locationId?: string;
  query?: string;
}): Promise<Lead[]> {
  const where = and(
    filters?.status ? eq(leads.status, filters.status) : undefined,
    filters?.categoryId ? eq(leads.category_id, filters.categoryId) : undefined,
    filters?.locationId ? eq(leads.location_id, filters.locationId) : undefined,
    filters?.query ? ilike(leads.business_name, `%${filters.query}%`) : undefined,
  );
  const rows = await getDb().select().from(leads).where(where).orderBy(desc(leads.created_at)).limit(400);
  return rows.map(mapLead);
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

export async function createLead(payload: {
  business_name?: string;
  category_id?: string | null;
  location_id?: string | null;
  facebook_url?: string | null;
  website_url?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  source: string;
  status?: LeadStatus;
}): Promise<Lead> {
  const rows = await getDb().insert(leads).values(payload).returning();
  if (!rows[0]) {
    throw new Error("Failed to create lead.");
  }
  return mapLead(rows[0]);
}

export async function bulkCreateLeads(
  payload: Array<{
    business_name?: string | null;
    category_id?: string | null;
    location_id?: string | null;
    facebook_url?: string | null;
    website_url?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    source: string;
    status?: LeadStatus;
  }>,
): Promise<Lead[]> {
  if (!payload.length) return [];
  const rows = await getDb().insert(leads).values(payload).returning();
  return rows.map(mapLead);
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
  }>,
): Promise<void> {
  const db = getDb();
  await db.delete(outreachMessages).where(eq(outreachMessages.lead_id, leadId));
  if (!messages.length) return;
  await db.insert(outreachMessages).values(
    messages.map((message) => ({
      lead_id: leadId,
      language: message.language as (typeof outreachMessages.$inferInsert)["language"],
      angle: message.angle as (typeof outreachMessages.$inferInsert)["angle"],
      variant_label: message.variant_label,
      message_text: message.message_text,
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
  byStatus: Record<LeadStatus, number>;
  byAngle: Record<string, number>;
  byLanguage: Record<string, number>;
  byVariant: Record<string, number>;
}> {
  const [leadsData, categoriesData, locationsData, messages] = await Promise.all([
    listLeads(),
    getCategories(),
    getLocations(),
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

  const byCategory: Record<string, number> = {};
  const byLocation: Record<string, number> = {};
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
    byCategory[category] = (byCategory[category] ?? 0) + 1;
    byLocation[location] = (byLocation[location] ?? 0) + 1;
  }

  for (const message of messages) {
    byAngle[message.angle] = (byAngle[message.angle] ?? 0) + 1;
    byLanguage[message.language] = (byLanguage[message.language] ?? 0) + 1;
    byVariant[message.variant_label] = (byVariant[message.variant_label] ?? 0) + 1;
  }

  return { byCategory, byLocation, byStatus, byAngle, byLanguage, byVariant };
}

export async function getBestVariantByCategory(): Promise<Array<{ category: string; bestVariant: string; sent: number; won: number }>> {
  const [leadsRows, messages, categoriesData] = await Promise.all([
    getDb().select({ id: leads.id, category_id: leads.category_id, status: leads.status }).from(leads),
    getDb().select({ lead_id: outreachMessages.lead_id, variant_label: outreachMessages.variant_label }).from(outreachMessages),
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
