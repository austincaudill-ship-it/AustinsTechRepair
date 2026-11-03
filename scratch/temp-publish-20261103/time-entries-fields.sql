-- =====================================================================
-- PORTAL_TIMECARDS_2026_11_02 / PORTAL_MILEAGE_2026_11_02 —
-- new fields on public.time_entries: entry type (Work / Driving),
-- miles, trip endpoints, and an optional note.
--
-- STAGED ONLY — publish-time step. Do not run until this set's
-- publish step. The portal degrades cleanly without it: every code
-- path probes for these columns first (the same fallback shape the
-- roster uses for employee_profiles.pay_rate) and simply hides the
-- type / miles / note / trip controls until the columns exist, so
-- running this late costs nothing.
-- Project: atr-customer-accounts (ref lyujxpuicarblpkdzuuc).
-- Idempotent: safe to re-run.
--
-- Why these columns (Austin, Nov 2, 2026):
--   * entry_type — time entries are Work or Driving (default Work).
--     Driving earns NO paid hours for anyone; it pays mileage only
--     (techs), and the owner's driving is unpaid entirely.
--   * miles — the trip's road miles (auto-computed by the Mileage
--     panel's routing, hand-adjustable afterwards).
--   * from_location / to_location (+ lat/lng when known) — the
--     trip's endpoints, free text as the tech typed or picked them.
--     The route duration is NOT a column: it lives in the entry
--     itself as clock_out minus clock_in, exactly like every other
--     time entry, so time cards and payroll need no special case.
--   * note — the optional note on the owner's manual add/edit form.
--
-- Grants: time_entries is an existing table already exposed to the
-- Data API with its grants and RLS policies in place, so new columns
-- inherit them; no new GRANT is needed (the explicit-GRANT rule
-- applies to newly created tables — see time-card-approvals.sql and
-- location-geofence.sql in this folder).
-- =====================================================================

alter table public.time_entries
  add column if not exists entry_type text not null default 'work';

-- Constrain the type values (added separately so re-runs stay safe).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'time_entries_entry_type_check'
  ) then
    alter table public.time_entries
      add constraint time_entries_entry_type_check
      check (entry_type in ('work', 'driving'));
  end if;
end $$;

alter table public.time_entries
  add column if not exists miles numeric(10,2),
  add column if not exists from_location text,
  add column if not exists to_location text,
  add column if not exists from_lat numeric(10,7),
  add column if not exists from_lng numeric(10,7),
  add column if not exists to_lat numeric(10,7),
  add column if not exists to_lng numeric(10,7),
  add column if not exists note text;

comment on column public.time_entries.entry_type is
  'work or driving (PORTAL_TIMECARDS_2026_11_02). Driving earns no paid hours; techs are reimbursed mileage only.';
comment on column public.time_entries.miles is
  'Road miles for a driving entry (PORTAL_MILEAGE_2026_11_02). Auto-computed by routing, hand-adjustable.';
comment on column public.time_entries.note is
  'Optional note from the owner manual time-entry form (PORTAL_TIMECARDS_2026_11_02).';

-- Verify after running:
--   select column_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'time_entries'
--   order by ordinal_position;
-- Expected new rows: entry_type (text), miles (numeric),
-- from_location / to_location (text), from_lat / from_lng /
-- to_lat / to_lng (numeric), note (text).
