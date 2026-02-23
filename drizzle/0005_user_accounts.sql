do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('ADMIN', 'AGENT');
  end if;
end $$;

create table if not exists user_accounts (
  id uuid primary key default gen_random_uuid(),
  username varchar(120) not null unique,
  display_name varchar(120) not null,
  password_hash text not null,
  role user_role not null default 'AGENT',
  assigned_category_id uuid references categories(id) on delete set null,
  is_active boolean not null default true,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_accounts(id) on delete cascade,
  token_hash varchar(128) not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

