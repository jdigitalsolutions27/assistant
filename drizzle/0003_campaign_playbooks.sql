CREATE TABLE IF NOT EXISTS campaign_playbooks (
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
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_playbooks_created
  ON campaign_playbooks(created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_playbooks_name_unique
  ON campaign_playbooks(name);
