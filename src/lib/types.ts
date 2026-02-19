export const LEAD_STATUSES = [
  "NEW",
  "DRAFTED",
  "SENT",
  "REPLIED",
  "QUALIFIED",
  "WON",
  "LOST",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const EVENT_TYPES = [
  "COPIED",
  "OPENED_LINK",
  "MARKED_SENT",
  "REPLIED",
  "QUALIFIED",
  "WON",
  "LOST",
] as const;

export type OutreachEventType = (typeof EVENT_TYPES)[number];

export const MESSAGE_LANGUAGES = ["Taglish", "English", "Waray"] as const;
export type MessageLanguage = (typeof MESSAGE_LANGUAGES)[number];

export const MESSAGE_TONES = ["Soft", "Direct", "Value-Focused"] as const;
export type MessageTone = (typeof MESSAGE_TONES)[number];

export const MESSAGE_ANGLES = ["booking", "low_volume", "organization"] as const;
export type MessageAngle = (typeof MESSAGE_ANGLES)[number];

export interface Category {
  id: string;
  name: string;
  default_angle: MessageAngle;
  created_at: string;
}

export interface Location {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  country: string | null;
  created_at: string;
}

export interface Lead {
  id: string;
  business_name: string | null;
  category_id: string | null;
  location_id: string | null;
  facebook_url: string | null;
  website_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  source: string;
  status: LeadStatus;
  score_heuristic: number | null;
  score_ai: number | null;
  score_total: number | null;
  last_contacted_at: string | null;
  created_at: string;
}

export interface KeywordPack {
  id: string;
  category_id: string;
  keywords: string[];
}

export interface OutreachMessage {
  id: string;
  lead_id: string;
  language: MessageLanguage;
  angle: MessageAngle;
  variant_label: "A" | "B" | "C";
  message_text: string;
  created_at: string;
}

export interface ProspectingConfig {
  id: string;
  name: string;
  category_id: string;
  location_id: string;
  keywords: string[];
  created_at: string;
}

export interface MessageTemplate {
  id: string;
  category_id: string;
  language: MessageLanguage;
  tone: MessageTone;
  template_text: string;
  created_at: string;
}

export interface ScoreWeights {
  heuristic: number;
  ai: number;
}

export interface DashboardKpis {
  totalLeads: number;
  drafted: number;
  sent: number;
  replies: number;
  qualified: number;
  won: number;
  replyRate: number;
  winRate: number;
}
