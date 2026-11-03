-- =====================================================================
-- RECEIPT_SIG_FIX_2026_11_03 — public.doc_short_codes: the short,
-- human-typeable document code printed on a receipt so a customer
-- can re-open their signed Repair Authorization without the raw
-- one-year signed URL ever appearing as text.
--
-- STAGED ONLY — publish-time step. Do not run until this set's
-- publish step. The portal degrades cleanly without it:
-- fetchReceiptAuthorization's ensureReceiptDocCode treats ANY error
-- (including this table not existing) as "no code", and the receipt
-- simply omits the code line, so running this late costs nothing.
-- Project: atr-customer-accounts (ref lyujxpuicarblpkdzuuc).
-- Idempotent: safe to re-run.
--
-- How a code is used (the full path):
--   1. The portal creates one row per signed document, lazily, the
--      first time a receipt for that ticket is composed (print,
--      filed, download, and email all pass through
--      fetchReceiptAuthorization). Codes are 8 characters from a
--      31-symbol alphabet with no confusable characters
--      (no I, L, O, 0, 1) — about 8.5e11 combinations, and the code
--      IS the credential, exactly as the one-year signed URL it
--      replaces on paper was a bearer link.
--   2. The customer goes to austinstechrepairgroup.com/
--      repair-authorization (static page, staged beside this file)
--      and types the code.
--   3. The page calls the doc-code Edge Function (staged beside
--      this file), which reads THIS table with the service role,
--      mints a FRESH one-hour signed URL for the stored
--      storage_path, and returns the view-doc.html viewer URL.
--      Nothing is ever served from a stored long-lived URL, and
--      this table holds no URL at all — only the storage path.
--
-- Why a table and not a derivation from the ticket id: the code
-- must name one DOCUMENT (a ticket can hold several signed
-- documents over time), must not be guessable from the ticket
-- number printed elsewhere on the same receipt, and must stay
-- stable for the life of the document. A stored random code is
-- the honest fit.
-- =====================================================================

create table if not exists public.doc_short_codes (
  code text primary key,                  -- 8 chars, portal-generated alphabet (portal.js DOC_CODE_ALPHABET)
  ticket_id uuid not null,                -- public.tickets.id the document belongs to
  storage_path text not null,             -- path inside the ticket-documents bucket
  doc_type text not null default 'repair_authorization',
  created_at timestamptz not null default now(),
  unique (ticket_id, storage_path)        -- one code per filed document
);

create index if not exists doc_short_codes_ticket_idx
  on public.doc_short_codes (ticket_id);

-- Explicit Data API grants (standing Oct 22, 2026 rule for new
-- tables): staff (authenticated) select/insert/update/delete so the
-- portal can resolve and lazily create codes; service_role full
-- (the doc-code Edge Function resolves codes with it); anon NONE —
-- deliberately: a code is resolved only through the Edge Function,
-- never by a direct anonymous table read, so codes cannot be
-- enumerated from the public API.
grant select, insert, update, delete on public.doc_short_codes to authenticated;
grant all on public.doc_short_codes to service_role;

-- RLS: employees only, mirroring time_card_approvals /
-- outbound_texts — an authenticated user counts as staff only when
-- their id has a row in employee_profiles. (Customer accounts
-- share this project; they get nothing here. Customers reach their
-- document through the code + Edge Function, not through this
-- table.)
alter table public.doc_short_codes enable row level security;

drop policy if exists doc_short_codes_staff_select on public.doc_short_codes;
create policy doc_short_codes_staff_select on public.doc_short_codes
  for select to authenticated
  using (exists (select 1 from public.employee_profiles ep where ep.id = auth.uid()));

drop policy if exists doc_short_codes_staff_insert on public.doc_short_codes;
create policy doc_short_codes_staff_insert on public.doc_short_codes
  for insert to authenticated
  with check (exists (select 1 from public.employee_profiles ep where ep.id = auth.uid()));

drop policy if exists doc_short_codes_staff_update on public.doc_short_codes;
create policy doc_short_codes_staff_update on public.doc_short_codes
  for update to authenticated
  using (exists (select 1 from public.employee_profiles ep where ep.id = auth.uid()))
  with check (exists (select 1 from public.employee_profiles ep where ep.id = auth.uid()));

drop policy if exists doc_short_codes_staff_delete on public.doc_short_codes;
create policy doc_short_codes_staff_delete on public.doc_short_codes
  for delete to authenticated
  using (exists (select 1 from public.employee_profiles ep where ep.id = auth.uid()));

-- Make sure PostgREST picks the new table up right away.
notify pgrst, 'reload schema';

-- Verify: table listed with its 4 staff policies.
select policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'doc_short_codes'
order by policyname;
