-- =====================================================================
-- PORTAL_LOCATION_2026_11_02 — geofencing support: location consent
-- on the associate profile, location snapshots at named work
-- events, geofences, and the fence enter/exit event log.
--
-- STAGED ONLY — publish-time step. Do not run until this set's
-- publish step. The portal degrades cleanly without every piece of
-- it: consent reads fall back to "unknown" (no prompt, no capture),
-- snapshot/fence writes fail silently, and the Mileage panel simply
-- shows its trip tools without the fence sections.
-- Project: atr-customer-accounts (ref lyujxpuicarblpkdzuuc).
-- Idempotent: safe to re-run.
--
-- The design (Austin, corrected Nov 2, 2026 — "No, we're just
-- using geofencing"): this is place-based automation, NOT device
-- tracking. A signed-in tech's browser is asked once, in the
-- portal's own words, to allow location. With permission granted,
-- the portal takes a location snapshot only at named work events —
-- login, clock in, clock out, mileage trip start/end — and, while
-- the portal is open, keeps a lightweight position watch so fence
-- crossings are noticed promptly. Snapshots and fence checks are
-- compared against geofences: a ~150 m circle around the business
-- base and one around each active job's service address. Crossing a
-- fence writes one fence_events row and offers the paperwork
-- automation (start/end the driving trip, offer the arrival status
-- flip). NOTHING is captured in the background, nothing is captured
-- without permission, and there is no continuous track anywhere in
-- this schema — a website cannot do that, and this design does not
-- pretend to (see REPORT.md).
-- =====================================================================

-- ---------- 1. Consent state on the associate's profile ----------
-- Mirrors the pay_rate precedent (employee-profiles-pay-rate.sql):
-- an existing table already exposed to the Data API, so the new
-- columns inherit its grants and policies; no new GRANT is needed.
alter table public.employee_profiles
  add column if not exists location_consent text not null default 'not_asked',
  add column if not exists location_consent_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'employee_profiles_location_consent_check'
  ) then
    alter table public.employee_profiles
      add constraint employee_profiles_location_consent_check
      check (location_consent in ('not_asked', 'granted', 'denied'));
  end if;
end $$;

comment on column public.employee_profiles.location_consent is
  'Geolocation permission state for geofencing (PORTAL_LOCATION_2026_11_02): not_asked, granted, or denied — set from the tech''s own answer in the portal.';

-- ---------- 2. Location snapshots (named work events only) ----------
create table if not exists public.location_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,                  -- public.employee_profiles.id / auth user id
  event text not null
    check (event in ('login', 'clock_in', 'clock_out', 'trip_start', 'trip_end')),
  lat numeric(10,7) not null,
  lng numeric(10,7) not null,
  accuracy_m numeric(8,1),
  created_at timestamptz not null default now()
);

create index if not exists location_snapshots_user_idx
  on public.location_snapshots (user_id, created_at desc);

grant select, insert on public.location_snapshots to authenticated;
grant all on public.location_snapshots to service_role;

alter table public.location_snapshots enable row level security;

-- A tech writes only their own snapshots and reads only their own;
-- the owner reads everyone's (the fence tooling runs in staff
-- sessions, and the owner is the one reviewing work events).
drop policy if exists location_snapshots_self_insert on public.location_snapshots;
create policy location_snapshots_self_insert on public.location_snapshots
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists location_snapshots_read on public.location_snapshots;
create policy location_snapshots_read on public.location_snapshots
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.employee_profiles ep
               where ep.id = auth.uid() and ep.role = 'owner')
  );
-- Deliberately no update/delete policy for authenticated: snapshots
-- are a work record, not a draft. Only service_role SQL can amend.

-- ---------- 3. Geofences ----------
create table if not exists public.geofences (
  id uuid primary key default gen_random_uuid(),
  label text not null,                    -- 'Business base' or the customer / job label
  address text,                           -- the address as typed / from the ticket
  lat numeric(10,7) not null,
  lng numeric(10,7) not null,
  radius_m integer not null default 150,
  kind text not null default 'ticket'
    check (kind in ('base', 'ticket', 'home')),
  ticket_id uuid,                         -- set for kind='ticket' fences; null otherwise
  employee_id uuid,                       -- set for kind='home' fences: whose home it is
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists geofences_ticket_idx
  on public.geofences (ticket_id) where active;
create index if not exists geofences_employee_idx
  on public.geofences (employee_id) where active;

grant select, insert, update, delete on public.geofences to authenticated;
grant all on public.geofences to service_role;

alter table public.geofences enable row level security;

-- Staff read and create (ticket fences are auto-created from
-- whichever staff session is heading to the job); only the owner
-- edits or removes a fence.
drop policy if exists geofences_staff_select on public.geofences;
create policy geofences_staff_select on public.geofences
  for select to authenticated
  using (exists (select 1 from public.employee_profiles ep where ep.id = auth.uid()));

drop policy if exists geofences_staff_insert on public.geofences;
create policy geofences_staff_insert on public.geofences
  for insert to authenticated
  with check (exists (select 1 from public.employee_profiles ep where ep.id = auth.uid()));

drop policy if exists geofences_owner_update on public.geofences;
create policy geofences_owner_update on public.geofences
  for update to authenticated
  using (exists (select 1 from public.employee_profiles ep
                 where ep.id = auth.uid() and ep.role = 'owner'))
  with check (exists (select 1 from public.employee_profiles ep
                 where ep.id = auth.uid() and ep.role = 'owner'));

drop policy if exists geofences_owner_delete on public.geofences;
create policy geofences_owner_delete on public.geofences
  for delete to authenticated
  using (exists (select 1 from public.employee_profiles ep
                 where ep.id = auth.uid() and ep.role = 'owner'));

-- ---------- 4. Fence events (arrived / left log) ----------
create table if not exists public.fence_events (
  id uuid primary key default gen_random_uuid(),
  fence_id uuid not null references public.geofences (id) on delete cascade,
  user_id uuid not null,                  -- the tech whose device crossed
  event text not null
    check (event in ('enter', 'exit')),
  lat numeric(10,7),
  lng numeric(10,7),
  occurred_at timestamptz not null default now()
);

create index if not exists fence_events_feed_idx
  on public.fence_events (occurred_at desc);
create index if not exists fence_events_fence_idx
  on public.fence_events (fence_id, user_id, occurred_at desc);

grant select, insert on public.fence_events to authenticated;
grant all on public.fence_events to service_role;

alter table public.fence_events enable row level security;

drop policy if exists fence_events_staff_select on public.fence_events;
create policy fence_events_staff_select on public.fence_events
  for select to authenticated
  using (exists (select 1 from public.employee_profiles ep where ep.id = auth.uid()));

drop policy if exists fence_events_self_insert on public.fence_events;
create policy fence_events_self_insert on public.fence_events
  for insert to authenticated
  with check (user_id = auth.uid());
-- No update/delete for authenticated: the feed is a log.

-- Make sure PostgREST picks the new tables up right away.
notify pgrst, 'reload schema';

-- Verify: policies for the three new tables.
select tablename, policyname, cmd from pg_policies
where schemaname = 'public'
  and tablename in ('location_snapshots', 'geofences', 'fence_events')
order by tablename, policyname;
