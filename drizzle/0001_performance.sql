CREATE INDEX IF NOT EXISTS idx_leads_status_category_location_created
  ON leads(status, category_id, location_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_events_lead_type_created
  ON outreach_events(lead_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_lead_created
  ON outreach_messages(lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_enrichment_lead_created
  ON lead_enrichment(lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_score_total_desc
  ON leads(score_total DESC);

CREATE INDEX IF NOT EXISTS idx_leads_website_lower
  ON leads ((lower(website_url)))
  WHERE website_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_facebook_lower
  ON leads ((lower(facebook_url)))
  WHERE facebook_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_phone_digits
  ON leads ((regexp_replace(phone, '\D', '', 'g')))
  WHERE phone IS NOT NULL;
