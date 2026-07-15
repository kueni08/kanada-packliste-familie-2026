create extension if not exists pgcrypto with schema extensions;

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code_hash text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null,
  display_name text not null check (display_name in ('Marc','Nici','Nils','Lou')),
  joined_at timestamptz not null default now(),
  primary key (family_id,user_id)
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  start_date date,
  end_date date,
  is_archived boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  unique(id,family_id)
);
create index if not exists trips_family_idx on public.trips(family_id);

create table if not exists public.packing_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  trip_id uuid not null,
  owner text not null check (owner in ('Allgemein','Marc','Nici','Nils','Lou','Laila')),
  category text not null check (char_length(category) between 1 and 80),
  label text not null check (char_length(label) between 1 and 160),
  done boolean not null default false,
  checked_by text,
  checked_at timestamptz,
  created_by text,
  position bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (trip_id,family_id) references public.trips(id,family_id) on delete cascade
);
create index if not exists packing_items_trip_idx on public.packing_items(trip_id,position);

create table if not exists public.packing_events (
  id bigint generated always as identity primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  trip_id uuid not null,
  item_id uuid,
  action text not null check (action in ('created','packed','unpacked','deleted')),
  actor text not null,
  item_label text not null,
  item_owner text not null,
  occurred_at timestamptz not null default now(),
  foreign key (trip_id,family_id) references public.trips(id,family_id) on delete cascade
);
create index if not exists packing_events_trip_idx on public.packing_events(trip_id,occurred_at desc);

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create or replace function private.is_family_member(fid uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.family_members m where m.family_id=fid and m.user_id=auth.uid()) $$;
revoke all on function private.is_family_member(uuid) from public;
grant execute on function private.is_family_member(uuid) to authenticated;

create or replace function private.track_packing_change()
returns trigger language plpgsql security definer set search_path=public
as $$
declare event_action text; event_actor text;
begin
  if tg_op='INSERT' then
    if coalesce(new.created_by,'') in ('System','Vorlage','Import') then return new; end if;
    event_action:='created'; event_actor:=coalesce(new.created_by,'Unbekannt');
  elsif old.deleted_at is null and new.deleted_at is not null then
    event_action:='deleted'; event_actor:=coalesce(new.checked_by,'Unbekannt');
  elsif old.done is distinct from new.done then
    event_action:=case when new.done then 'packed' else 'unpacked' end;
    event_actor:=coalesce(new.checked_by,'Unbekannt');
  else
    return new;
  end if;
  insert into public.packing_events(family_id,trip_id,item_id,action,actor,item_label,item_owner,occurred_at)
  values(new.family_id,new.trip_id,new.id,event_action,event_actor,new.label,new.owner,coalesce(new.checked_at,new.updated_at,now()));
  return new;
end $$;
drop trigger if exists packing_item_tracking on public.packing_items;
create trigger packing_item_tracking after insert or update on public.packing_items for each row execute function private.track_packing_change();

create or replace function public.join_family(p_code text,p_display_name text)
returns table(family_id uuid,family_name text)
language plpgsql security definer set search_path=public,extensions
as $$
declare f public.families%rowtype;
begin
  if auth.uid() is null then raise exception 'Anmeldung erforderlich'; end if;
  if p_display_name not in ('Marc','Nici','Nils','Lou') then raise exception 'Ungültiger Name'; end if;
  select * into f from public.families where code_hash=encode(extensions.digest(upper(trim(p_code)),'sha256'),'hex');
  if f.id is null then raise exception 'Ungültiger Familiencode'; end if;
  insert into public.family_members(family_id,user_id,display_name) values(f.id,auth.uid(),p_display_name)
  on conflict on constraint family_members_pkey do update set display_name=excluded.display_name;
  return query select f.id,f.name;
end $$;
revoke all on function public.join_family(text,text) from public;
grant execute on function public.join_family(text,text) to authenticated;

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.trips enable row level security;
alter table public.packing_items enable row level security;
alter table public.packing_events enable row level security;

drop policy if exists "members read family" on public.families;
create policy "members read family" on public.families for select to authenticated using(private.is_family_member(id));
drop policy if exists "members read memberships" on public.family_members;
create policy "members read memberships" on public.family_members for select to authenticated using(private.is_family_member(family_id));
drop policy if exists "members read trips" on public.trips;
create policy "members read trips" on public.trips for select to authenticated using(private.is_family_member(family_id));
drop policy if exists "members add trips" on public.trips;
create policy "members add trips" on public.trips for insert to authenticated with check(private.is_family_member(family_id));
drop policy if exists "members update trips" on public.trips;
create policy "members update trips" on public.trips for update to authenticated using(private.is_family_member(family_id)) with check(private.is_family_member(family_id));
drop policy if exists "members read items" on public.packing_items;
create policy "members read items" on public.packing_items for select to authenticated using(private.is_family_member(family_id));
drop policy if exists "members add items" on public.packing_items;
create policy "members add items" on public.packing_items for insert to authenticated with check(private.is_family_member(family_id));
drop policy if exists "members update items" on public.packing_items;
create policy "members update items" on public.packing_items for update to authenticated using(private.is_family_member(family_id)) with check(private.is_family_member(family_id));
drop policy if exists "members delete items" on public.packing_items;
create policy "members delete items" on public.packing_items for delete to authenticated using(private.is_family_member(family_id));
drop policy if exists "members read events" on public.packing_events;
create policy "members read events" on public.packing_events for select to authenticated using(private.is_family_member(family_id));

grant select on public.families,public.family_members,public.packing_events to authenticated;
grant select,insert,update,delete on public.trips,public.packing_items to authenticated;

alter table public.packing_items replica identity full;
alter table public.packing_events replica identity full;
do $$ begin alter publication supabase_realtime add table public.packing_items; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.packing_events; exception when duplicate_object then null; end $$;
