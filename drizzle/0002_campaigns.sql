DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'campaign_status') THEN
    CREATE TYPE campaign_status AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_kind') THEN
    CREATE TYPE message_kind AS ENUM ('initial', 'follow_up');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(140) NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  language message_language NOT NULL DEFAULT 'Taglish',
  tone message_tone NOT NULL DEFAULT 'Soft',
  angle message_angle NOT NULL DEFAULT 'booking',
  min_quality_score NUMERIC(5,2) NOT NULL DEFAULT 45,
  daily_send_target INTEGER NOT NULL DEFAULT 20,
  follow_up_days INTEGER NOT NULL DEFAULT 3,
  status campaign_status NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;

ALTER TABLE outreach_messages
  ADD COLUMN IF NOT EXISTS message_kind message_kind NOT NULL DEFAULT 'initial';

CREATE INDEX IF NOT EXISTS idx_campaigns_status_created
  ON campaigns(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_campaign_status
  ON leads(campaign_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outreach_messages_kind_created
  ON outreach_messages(lead_id, message_kind, created_at DESC);
