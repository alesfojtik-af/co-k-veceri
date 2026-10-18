-- Co k večeři: schéma pro existující projekt Supabase.
-- Tabulky mají prefix cv_ a leží ve schématu public, aby se nemuselo nic zapínat v nastavení API.
-- Spusťte celé v SQL Editoru. Skript je opakovatelný.

create table if not exists public.cv_households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Domácnost',
  join_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.cv_members (
  household_id uuid not null references public.cv_households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Celý stav aplikace (nastavení, zásoby, recepty, jídla) jako jeden dokument na domácnost.
create table if not exists public.cv_state (
  household_id uuid primary key references public.cv_households(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create or replace function public.cv_is_member(h uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cv_members m where m.household_id = h and m.user_id = auth.uid());
$$;

alter table public.cv_households enable row level security;
alter table public.cv_members enable row level security;
alter table public.cv_state enable row level security;

drop policy if exists cv_households_select on public.cv_households;
create policy cv_households_select on public.cv_households for select using (public.cv_is_member(id));

drop policy if exists cv_members_select on public.cv_members;
create policy cv_members_select on public.cv_members for select using (user_id = auth.uid() or public.cv_is_member(household_id));

drop policy if exists cv_state_select on public.cv_state;
create policy cv_state_select on public.cv_state for select using (public.cv_is_member(household_id));
drop policy if exists cv_state_insert on public.cv_state;
create policy cv_state_insert on public.cv_state for insert with check (public.cv_is_member(household_id));
drop policy if exists cv_state_update on public.cv_state;
create policy cv_state_update on public.cv_state for update using (public.cv_is_member(household_id)) with check (public.cv_is_member(household_id));

-- Vytvoření domácnosti: vrátí id a kód pro pozvání dalších členů.
create or replace function public.cv_create_household(p_name text default 'Domácnost')
returns table (id uuid, join_code text) language plpgsql security definer set search_path = public as $$
declare hid uuid; code text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  insert into public.cv_households (name, join_code) values (coalesce(nullif(p_name, ''), 'Domácnost'), code) returning cv_households.id into hid;
  insert into public.cv_members (household_id, user_id) values (hid, auth.uid());
  insert into public.cv_state (household_id, updated_by) values (hid, auth.uid());
  return query select hid, code;
end $$;

-- Připojení k domácnosti kódem.
create or replace function public.cv_join_household(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select h.id into hid from public.cv_households h where h.join_code = upper(trim(p_code));
  if hid is null then raise exception 'unknown code'; end if;
  insert into public.cv_members (household_id, user_id) values (hid, auth.uid()) on conflict do nothing;
  return hid;
end $$;

-- Moje domácnost (první, ke které patřím).
create or replace function public.cv_my_household()
returns table (id uuid, join_code text) language sql stable security definer set search_path = public as $$
  select h.id, h.join_code from public.cv_households h
  join public.cv_members m on m.household_id = h.id
  where m.user_id = auth.uid() order by m.created_at limit 1;
$$;

revoke all on function public.cv_create_household(text), public.cv_join_household(text), public.cv_my_household() from public, anon;
grant execute on function public.cv_create_household(text), public.cv_join_household(text), public.cv_my_household() to authenticated;
