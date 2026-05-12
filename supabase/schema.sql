create extension if not exists "pgcrypto";

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  name text not null default '',
  headline text not null default '',
  company text not null default '',
  position text not null default '',
  location text not null default '',
  email text not null default '',
  profile_url text not null default '',
  profile_image text not null default '',
  connected_on text not null default '',
  tags text[] not null default '{}',
  group_name text not null default '',
  category text not null default '',
  notes text not null default '',
  next_follow_up date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contacts
  alter column user_id set default auth.uid(),
  alter column user_id set not null;

create index if not exists contacts_user_id_idx on public.contacts(user_id);
create index if not exists contacts_group_name_idx on public.contacts(user_id, group_name);
create index if not exists contacts_tags_idx on public.contacts using gin(tags);

create table if not exists public.app_settings (
  key text primary key,
  value text not null
);

alter table public.app_settings enable row level security;

alter table public.contacts enable row level security;

drop policy if exists "Users can read their own contacts" on public.contacts;
create policy "Users can read their own contacts"
on public.contacts for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own contacts" on public.contacts;
create policy "Users can insert their own contacts"
on public.contacts for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own contacts" on public.contacts;
create policy "Users can update their own contacts"
on public.contacts for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own contacts" on public.contacts;
create policy "Users can delete their own contacts"
on public.contacts for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read public app settings" on public.app_settings;
create policy "Users can read public app settings"
on public.app_settings for select
using (true);

-- Optional owner-only mode:
-- 1. Uncomment and set this value to your email.
-- 2. Run this SQL again.
-- 3. Disable public signups in Supabase Auth settings for the strongest lock.
--
-- insert into public.app_settings (key, value)
-- values ('allowed_email', 'you@example.com')
-- on conflict (key) do update set value = excluded.value;
--
-- drop policy if exists "Only owner can insert contacts" on public.contacts;
-- drop policy if exists "Users can insert their own contacts" on public.contacts;
-- create policy "Only owner can insert contacts"
-- on public.contacts for insert
-- with check (
--   auth.uid() = user_id
--   and lower(auth.jwt() ->> 'email') = (
--     select lower(value) from public.app_settings where key = 'allowed_email'
--   )
-- );
