alter table locations
  add column if not exists owner_user_id uuid;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_name = 'locations'
      and constraint_type = 'UNIQUE'
      and constraint_name = 'locations_name_key'
  ) then
    alter table locations drop constraint locations_name_key;
  end if;

  if exists (
    select 1
    from information_schema.table_constraints
    where table_name = 'locations'
      and constraint_type = 'UNIQUE'
      and constraint_name = 'locations_name_unique'
  ) then
    alter table locations drop constraint locations_name_unique;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where table_name = 'locations'
      and constraint_type = 'FOREIGN KEY'
      and constraint_name = 'locations_owner_user_id_fkey'
  ) then
    alter table locations
      add constraint locations_owner_user_id_fkey
      foreign key (owner_user_id) references user_accounts(id) on delete cascade;
  end if;
end $$;

create unique index if not exists idx_locations_global_name_unique
  on locations (lower(name))
  where owner_user_id is null;

create unique index if not exists idx_locations_user_name_unique
  on locations (owner_user_id, lower(name))
  where owner_user_id is not null;

create index if not exists idx_locations_owner_user
  on locations (owner_user_id);
