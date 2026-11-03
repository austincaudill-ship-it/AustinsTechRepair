-- =====================================================================
-- PORTAL_MILEAGE_2026_11_02 — a home address on the associate's
-- sign-in profile (public.employee_profiles.home_address).
--
-- STAGED ONLY. Do not run until this set's publish step — and run it
-- BEFORE (or with) the portal files that ask for the column. The
-- portal degrades cleanly without it (the home-address fields probe
-- for the column and simply do not render until it exists — the
-- same fallback shape as pay_rate), so running it late costs
-- nothing.
-- Project: atr-customer-accounts (ref lyujxpuicarblpkdzuuc).
-- Idempotent: safe to re-run.
--
-- Why this column (Austin, Nov 2, 2026): mileage trips normally run
-- from the employee's house to the store or a customer's address.
-- The home address on the profile is the default From on that
-- tech's mileage trips and the center of their home geofence
-- (PORTAL_LOCATION_2026_11_02). The associate can set their own;
-- the owner can set or edit anyone's from the Associates roster.
--
-- Privacy: a home address is the associate's own data. The portal
-- only ever requests the column for the signed-in user's own row
-- and on the owner's roster load, and renders it only to the owner
-- and the associate themselves (the same gating as pay_rate).
--
-- Grants: employee_profiles is an existing table already exposed to
-- the Data API with its grants and RLS policies in place, so a new
-- column inherits them; no new GRANT is needed (the explicit-GRANT
-- rule applies to newly created tables).
-- =====================================================================

alter table public.employee_profiles
  add column if not exists home_address text;

comment on column public.employee_profiles.home_address is
  'The associate''s home address — default From for their mileage trips and the center of their home geofence (PORTAL_MILEAGE_2026_11_02). Visible to the owner and the associate only.';

-- Verify after running:
--   select column_name, data_type from information_schema.columns
--   where table_schema = 'public' and table_name = 'employee_profiles'
--     and column_name = 'home_address';
-- Expected: one row, home_address (text).
