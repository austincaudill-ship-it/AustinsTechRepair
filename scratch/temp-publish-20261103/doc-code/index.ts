// =====================================================================
// doc-code — Supabase Edge Function
// RECEIPT_SIG_FIX_2026_11_03 (Austin, Nov 3, 2026): a printed receipt
// must never carry the raw signed URL of a customer's Repair
// Authorization as text. Instead the receipt prints one short,
// typeable line — austinstechrepairgroup.com/repair-authorization
// plus an 8-character document code — and this function is the
// resolver behind that page.
//
//   POST { code }
//     -> { ok: true, url }   url = the view-doc.html viewer URL
//                            carrying a FRESH one-hour signed URL
//     -> { ok: false, error: "invalid_code" | "not_found" |
//                            "not_configured" }
//
// The caller is the customer, on a phone, holding a paper receipt —
// there is no account session, so this function is deliberately
// PUBLIC: deploy with JWT verification OFF. The gate is the code
// itself. That is the same trust shape as what it replaces: the old
// receipt printed a one-year bearer signed URL in full. The code is
// strictly better — 8 characters from a 31-symbol alphabet with no
// confusable characters (~8.5e11 combinations), it names exactly
// one document, nothing long-lived is stored or printed (this
// function mints a one-hour signed URL per request from the stored
// storage path), and a code can be retired by deleting its
// doc_short_codes row without touching the document.
//
// What it will resolve: only rows whose doc_type is
// 'repair_authorization' and whose storage path is an .html filing
// (the formatted document view-doc.html renders). PNG signature
// fallback filings have no full document and never resolve here.
//
// CORS is locked to the site origin (send-receipt / portal-mail
// pattern): the only legitimate caller is the repair-authorization
// page on austinstechrepairgroup.com.
//
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY are provided automatically by the
// platform. No Zoho or other secrets are read. The service role is
// used for exactly two reads: the doc_short_codes lookup and the
// storage signed-URL mint — anon has NO access to either by design
// (see doc-short-codes.sql).
//
// STAGED ONLY — not deployed, not run. Deploy alongside
// doc-short-codes.sql and repair-authorization.html at publish.
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const DOC_BUCKET = "ticket-documents";
const DOC_VIEWER_URL = "https://austinstechrepairgroup.com/view-doc.html?u=";
const SIGNED_URL_SECONDS = 3600; // one hour — the page redirects immediately

const CORS = {
  "Access-Control-Allow-Origin": "https://austinstechrepairgroup.com",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/* Codes print grouped for the eye (K7QX-4MZD) but are stored plain.
 * Accept whatever the customer actually types: any case, with or
 * without the hyphen, spaces, or stray characters. */
function normalizeCode(raw: unknown): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ ok: false, error: "not_configured" });
  }

  let code = "";
  try {
    const body = await req.json();
    code = normalizeCode(body?.code);
  } catch {
    return json({ ok: false, error: "invalid_code" });
  }
  if (code.length !== 8) return json({ ok: false, error: "invalid_code" });

  try {
    const db = admin();
    const lookup = await db
      .from("doc_short_codes")
      .select("storage_path, doc_type")
      .eq("code", code)
      .limit(1);
    if (lookup.error || !lookup.data || !lookup.data.length) {
      return json({ ok: false, error: "not_found" });
    }
    const row = lookup.data[0];
    const path = String(row.storage_path || "");
    if (row.doc_type !== "repair_authorization" || !/\.html?$/i.test(path)) {
      return json({ ok: false, error: "not_found" });
    }
    const signed = await db.storage
      .from(DOC_BUCKET)
      .createSignedUrl(path, SIGNED_URL_SECONDS);
    if (signed.error || !signed.data?.signedUrl) {
      return json({ ok: false, error: "not_found" });
    }
    return json({
      ok: true,
      url: DOC_VIEWER_URL + encodeURIComponent(signed.data.signedUrl),
    });
  } catch {
    return json({ ok: false, error: "not_found" });
  }
});
