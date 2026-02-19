CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_status') THEN
    CREATE TYPE lead_status AS ENUM ('NEW', 'DRAFTED', 'SENT', 'REPLIED', 'QUALIFIED', 'WON', 'LOST');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outreach_event_type') THEN
    CREATE TYPE outreach_event_type AS ENUM ('COPIED', 'OPENED_LINK', 'MARKED_SENT', 'REPLIED', 'QUALIFIED', 'WON', 'LOST');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_angle') THEN
    CREATE TYPE message_angle AS ENUM ('booking', 'low_volume', 'organization');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_language') THEN
    CREATE TYPE message_language AS ENUM ('Taglish', 'English', 'Waray');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_tone') THEN
    CREATE TYPE message_tone AS ENUM ('Soft', 'Direct', 'Value-Focused');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL UNIQUE,
  default_angle message_angle NOT NULL DEFAULT 'booking',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL UNIQUE,
  city VARCHAR(120),
  region VARCHAR(120),
  country VARCHAR(120) DEFAULT 'Philippines',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS keyword_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  keywords TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name VARCHAR(180),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  facebook_url VARCHAR(255),
  website_url VARCHAR(255),
  phone VARCHAR(60),
  email VARCHAR(120),
  address VARCHAR(255),
  source VARCHAR(64) NOT NULL DEFAULT 'manual',
  status lead_status NOT NULL DEFAULT 'NEW',
  score_heuristic NUMERIC(5,2),
  score_ai NUMERIC(5,2),
  score_total NUMERIC(5,2),
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_enrichment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_keywords TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outreach_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  language message_language NOT NULL,
  angle message_angle NOT NULL,
  variant_label VARCHAR(1) NOT NULL,
  message_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outreach_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event_type outreach_event_type NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  language message_language NOT NULL,
  tone message_tone NOT NULL,
  template_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(80) NOT NULL UNIQUE,
  value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prospecting_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_category ON leads(category_id);
CREATE INDEX IF NOT EXISTS idx_leads_location ON leads(location_id);
CREATE INDEX IF NOT EXISTS idx_events_lead ON outreach_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_messages_lead ON outreach_messages(lead_id);
