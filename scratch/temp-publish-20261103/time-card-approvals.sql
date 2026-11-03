-- =====================================================================
-- PORTAL_TIMECARDS_2026_11_02 — public.time_card_approvals: the
-- owner's weekly time-card approval, one row per associate per
-- pay week.
--
-- STAGED ONLY — publish-time step. Do not run until this set's
-- publish step. The portal degrades cleanly without it: the Time
-- cards view hides the Approve controls and Financials counts all
-- payroll as "awaiting approval" until the table exists, so running
-- this late costs nothing.
-- Project: atr-customer-accounts (ref lyujxpuicarblpkdzuuc).
-- Idempotent: safe to re-run.
--
-- Why a table of its own (Austin, Nov 2, 2026): time cards are
-- approved WEEKLY — Austin approves every Tuesday, for Friday pay,
-- for the completed Monday–Sunday pay week. time_entries already
-- carries a per-ENTRY approved flag (the shift-level approve button
-- on each time card); a per-week approval is a different fact and
-- must not overwrite it. One row here = "this associate's whole pay
-- week starting week_start is approved for pay". Unapproving is
-- deleting the row — there is no second state to keep in sync.
--
-- week_start is the Monday of the pay week (the portal's own
-- weekStart() definition), stored as a date so the portal's key
-- (employee_id + 'YYYY-MM-DD' of the Monday) matches exactly.
-- =====================================================================

create table if not exists public.time_card_approvals (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null,              -- public.employee_profiles.id of the associate
  week_start date not null,               -- Monday of the approved pay week
  approved_by uuid,                       -- auth user id of the owner who approved
  approved_at timestamptz not null default now(),
  unique (employee_id, week_start)
);

create index if not exists time_card_approvals_week_idx
  on public.time_card_approvals (week_start);

-- Explicit Data API grants (standing Oct 22, 2026 rule for new
-- tables): staff (authenticated) full access, service_role full,
-- anon none — approvals are staff-only data.
grant select, insert, update, delete on public.time_card_approvals to authenticated;
grant all on public.time_card_approvals to service_role;

-- RLS: employees only, mirroring outbound_texts — an authenticated
-- user counts as staff only when their id has a row in
-- employee_profiles (the same check the portal itself runs). The
-- owner-only part of approval is held by the portal UI (the same
-- line the pay-rate editor holds); any staff session that can read
-- the table can see approval state, which the Time cards view shows
-- to each associate for their own week anyway.
alter table public.time_card_approvals enable row level security;

drop policy if exists time_card_approvals_staff_select on public.time_card_approvals;
create policy time_card_approvals_staff_select on public.time_card_approvals
  for select to authenticated
  using (exists (select 1 from public.employee_profiles ep where ep.id = auth.uid()));

drop policy if exists time_card_approvals_staff_insert on public.time_card_approvals;
create policy time_card_approvals_staff_insert on public.time_card_approvals
  for insert to authenticated
  with check (exists (select 1 from public.employee_profiles ep where ep.id = auth.uid()));

drop policy if exists time_card_approvals_staff_update on public.time_card_approvals;
create policy time_card_approvals_staff_update on public.time_card_approvals
  for update to authenticated
  using (exists (select 1 from public.employee_profiles ep where ep.id = auth.uid()))
  with check (exists (select 1 from public.employee_profiles ep where ep.id = auth.uid()));

drop policy if exists time_card_approvals_staff_delete on public.time_card_approvals;
create policy time_card_approvals_staff_delete on public.time_card_approvals
  for delete to authenticated
  using (exists (select 1 from public.employee_profiles ep where ep.id = auth.uid()));

-- Make sure PostgREST picks the new table up right away.
notify pgrst, 'reload schema';

-- Verify: table listed with its 4 staff policies.
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'time_card_approvals'
order by policyname;
