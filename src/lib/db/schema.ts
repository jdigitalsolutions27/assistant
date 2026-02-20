import {
  jsonb,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const leadStatusEnum = pgEnum("lead_status", [
  "NEW",
  "DRAFTED",
  "SENT",
  "REPLIED",
  "QUALIFIED",
  "WON",
  "LOST",
]);

export const outreachEventEnum = pgEnum("outreach_event_type", [
  "COPIED",
  "OPENED_LINK",
  "MARKED_SENT",
  "REPLIED",
  "QUALIFIED",
  "WON",
  "LOST",
]);

export const angleEnum = pgEnum("message_angle", ["booking", "low_volume", "organization"]);
export const languageEnum = pgEnum("message_language", ["Taglish", "English", "Tagalog", "Waray"]);
export const toneEnum = pgEnum("message_tone", ["Soft", "Direct", "Value-Focused"]);
export const campaignStatusEnum = pgEnum("campaign_status", ["ACTIVE", "PAUSED", "ARCHIVED"]);
export const messageKindEnum = pgEnum("message_kind", ["initial", "follow_up"]);

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  default_angle: angleEnum("default_angle").notNull().default("booking"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const locations = pgTable("locations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull().unique(),
  city: varchar("city", { length: 120 }),
  region: varchar("region", { length: 120 }),
  country: varchar("country", { length: 120 }).default("Philippines"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const keywordPacks = pgTable("keyword_packs", {
  id: uuid("id").defaultRandom().primaryKey(),
  category_id: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  keywords: text("keywords").array().notNull().default([]),
});

export const leads = pgTable("leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  business_name: varchar("business_name", { length: 180 }),
  category_id: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  location_id: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  facebook_url: varchar("facebook_url", { length: 255 }),
  website_url: varchar("website_url", { length: 255 }),
  phone: varchar("phone", { length: 60 }),
  email: varchar("email", { length: 120 }),
  address: varchar("address", { length: 255 }),
  campaign_id: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  source: varchar("source", { length: 64 }).notNull().default("manual"),
  status: leadStatusEnum("status").notNull().default("NEW"),
  score_heuristic: numeric("score_heuristic", { precision: 5, scale: 2, mode: "number" }),
  score_ai: numeric("score_ai", { precision: 5, scale: 2, mode: "number" }),
  score_total: numeric("score_total", { precision: 5, scale: 2, mode: "number" }),
  last_contacted_at: timestamp("last_contacted_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const leadEnrichment = pgTable("lead_enrichment", {
  id: uuid("id").defaultRandom().primaryKey(),
  lead_id: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  raw_json: jsonb("raw_json").notNull().default({}),
  detected_keywords: text("detected_keywords").array().notNull().default([]),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const outreachMessages = pgTable("outreach_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  lead_id: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  language: languageEnum("language").notNull(),
  angle: angleEnum("angle").notNull(),
  variant_label: varchar("variant_label", { length: 1 }).notNull(),
  message_kind: messageKindEnum("message_kind").notNull().default("initial"),
  message_text: text("message_text").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const outreachEvents = pgTable("outreach_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  lead_id: uuid("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  event_type: outreachEventEnum("event_type").notNull(),
  metadata_json: jsonb("metadata_json").notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messageTemplates = pgTable("message_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  category_id: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  language: languageEnum("language").notNull(),
  tone: toneEnum("tone").notNull(),
  template_text: text("template_text").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appSettings = pgTable("app_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 80 }).notNull().unique(),
  value_json: jsonb("value_json").notNull().default({}),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const prospectingConfigs = pgTable("prospecting_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  category_id: uuid("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  location_id: uuid("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "cascade" }),
  keywords: text("keywords").array().notNull().default([]),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 140 }).notNull(),
  category_id: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  location_id: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  language: languageEnum("language").notNull().default("Taglish"),
  tone: toneEnum("tone").notNull().default("Soft"),
  angle: angleEnum("angle").notNull().default("booking"),
  min_quality_score: numeric("min_quality_score", { precision: 5, scale: 2, mode: "number" }).notNull().default(45),
  daily_send_target: integer("daily_send_target").notNull().default(20),
  follow_up_days: integer("follow_up_days").notNull().default(3),
  status: campaignStatusEnum("status").notNull().default("ACTIVE"),
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const campaignPlaybooks = pgTable("campaign_playbooks", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 140 }).notNull(),
  category_id: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  location_id: uuid("location_id").references(() => locations.id, { onDelete: "set null" }),
  language: languageEnum("language").notNull().default("Taglish"),
  tone: toneEnum("tone").notNull().default("Soft"),
  angle: angleEnum("angle").notNull().default("booking"),
  min_quality_score: numeric("min_quality_score", { precision: 5, scale: 2, mode: "number" }).notNull().default(45),
  daily_send_target: integer("daily_send_target").notNull().default(20),
  follow_up_days: integer("follow_up_days").notNull().default(3),
  notes: text("notes"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
