create table if not exists agent_prospecting_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_accounts(id) on delete cascade,
  action_type varchar(24) not null default 'MARKED_SENT',
  category_id uuid not null references categories(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  match_key varchar(255) not null,
  business_name varchar(180),
  address varchar(255),
  website_url varchar(255),
  facebook_url varchar(255),
  phone varchar(60),
  email varchar(120),
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_agent_prospecting_actions_unique_sent
  on agent_prospecting_actions (user_id, category_id, location_id, action_type, match_key);

create index if not exists idx_agent_prospecting_actions_user_created
  on agent_prospecting_actions (user_id, created_at desc);

create index if not exists idx_agent_prospecting_actions_created
  on agent_prospecting_actions (created_at desc);
