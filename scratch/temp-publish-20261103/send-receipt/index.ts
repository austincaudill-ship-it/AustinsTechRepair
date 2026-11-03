// =====================================================================
// send-receipt — Supabase Edge Function
// PORTAL_RECEIPT_SEND_2026_11_02 (Austin, Nov 2, 2026: "give the
// portal life outside the portal" — when Message customer / the
// Google Voice text does not reach the customer, email the receipt).
//
// Sends ONE ticket's receipt PDF to that ticket's customer, from the
// Associate Hub's Email receipt button (ticket drawer -> Charges).
//
//   POST { ticket_id }
//     -> { ok: true, recipient } | { ok: false, error }
//
// The request body carries ONLY the ticket id — never a recipient,
// subject, or body (the notify-events rule). Everything else is
// resolved server-side:
//   - Recipient: tickets.customer_id -> customers.email, falling
//     back to tickets.customer_email — the exact notify-events
//     resolveRecipient chain. Never guessed, never any other
//     person's address.
//   - Attachment: the receipt PDF the portal just built from the
//     ticket's fresh charges and uploaded to the ticket-documents
//     bucket at <ticket_id>/receipt-generated.pdf. That filed copy
//     is the function's only content source, so what is emailed is
//     always the receipt of record.
//
// Sender (Austin's mailbox rule, Nov 2, 2026): automated system mail
// NEVER sends from austin.caudill@austinstechrepairgroup.com — that
// mailbox is Austin's own. A receipt is system mail, so it sends as
// the dedicated no-reply system mailbox, the same identity
// mfa-email-backup uses, with Reply-To set to
// service@austinstechrepairgroup.com, the general replyable inbox,
// so a customer who replies reaches a monitored inbox instead of a
// dead end.
//
// Gates, checked server-side before any mail work (the portal-mail /
// mfa-email-backup pattern):
//   1. A live caller JWT (validated against /auth/v1/user).
//   2. The caller is staff: a row in public.employee_profiles.
//      (Customer accounts share this Supabase project; they get
//      nothing here.) Unlike mfa-email-backup there is deliberately
//      NO aal restriction: Email receipt is a normal signed-in staff
//      action, behind the portal's own sign-in and MFA gate.
//
// Bookkeeping: every attempt is recorded in public.notification_log
// (kind 'receipt') BEFORE sending and finished 'sent' or 'failed'
// after — the notify-events pattern. Receipt sends are deliberate
// staff actions (a resend after fixing an address is legitimate),
// so the dedupe_key is unique per attempt rather than per ticket:
// the log is an audit trail here, not a duplicate blocker. An
// ambiguous SMTP failure is marked with the same
// do-not-resend-blindly note notify-events uses.
//
// Secrets (Edge Functions -> Secrets; values NEVER live in this
// file) — the project's shared system-mail set, the same four
// mfa-email-backup expects:
//   ZOHO_SMTP_HOST        smtp.zoho.com
//   ZOHO_SMTP_PORT        465
//   ZOHO_SMTP_USER        no-reply@austinstechrepairgroup.com
//   ZOHO_SMTP_PASSWORD    the no-reply mailbox's OWN Zoho app
//                         password (created at that mailbox's first
//                         sign-in — Austin's step)
//   ZOHO_SMTP_FROM_NAME   optional; the From display name. Defaults
//                         to "Austin's Tech Repair Group".
//   RECEIPT_REPLY_TO      optional; defaults to
//                         service@austinstechrepairgroup.com
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
// provided automatically by the platform. Deploy with JWT
// verification ON (the default); the in-function checks above are
// the real gate. When the Zoho secrets are absent the function
// answers { ok: false, error: "not_configured" } and the portal
// says so plainly — never a stack trace.
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SMTP_HOST = Deno.env.get("ZOHO_SMTP_HOST") || "smtp.zoho.com";
const SMTP_PORT = Number(Deno.env.get("ZOHO_SMTP_PORT") || "465");
const SMTP_USER = Deno.env.get("ZOHO_SMTP_USER") ?? "";
const SMTP_PASSWORD = Deno.env.get("ZOHO_SMTP_PASSWORD") ?? "";
const SMTP_FROM_NAME =
  Deno.env.get("ZOHO_SMTP_FROM_NAME") || "Austin's Tech Repair Group";
const REPLY_TO =
  Deno.env.get("RECEIPT_REPLY_TO") || "service@austinstechrepairgroup.com";

const SITE_URL = "https://austinstechrepairgroup.com/";
const LOGO_URL = "https://austinstechrepairgroup.com/images/atr-logo.png";
const DOC_BUCKET = "ticket-documents";

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

type Admin = ReturnType<typeof admin>;

// ---------------------------------------------------------------------
// Caller validation (portal-mail / mfa-email-backup pattern)
// ---------------------------------------------------------------------

function decodeJwtClaims(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

async function validateCaller(
  req: Request,
): Promise<{ caller: { id: string } } | { error: string; status: number }> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token || !SUPABASE_URL || !ANON_KEY) {
    return { error: "unauthorized", status: 401 };
  }
  const who = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { Authorization: auth, apikey: ANON_KEY },
  });
  if (!who.ok) return { error: "unauthorized", status: 401 };
  const user = await who.json().catch(() => null);
  if (!user || !user.id) return { error: "unauthorized", status: 401 };

  const claims = decodeJwtClaims(token);
  if (!claims || claims.sub !== user.id) {
    return { error: "unauthorized", status: 401 };
  }

  // Staff gate — the same employee_profiles membership the portal
  // itself applies. Customer accounts share this project and get
  // nothing here.
  const sb = admin();
  const { data: profile } = await sb
    .from("employee_profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) return { error: "not_staff", status: 403 };

  return { caller: { id: String(user.id) } };
}

// ---------------------------------------------------------------------
// Small helpers (the notify-events set)
// ---------------------------------------------------------------------

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Device wording exactly as the site builds it: [device_type, brand,
// model] joined, "your device" when nothing is known.
function deviceWording(t: Record<string, unknown> | null | undefined): string {
  if (!t) return "your device";
  const parts = [t.device_type, t.brand, t.model]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);
  return parts.length ? parts.join(" ") : "your device";
}

function firstNameOf(name: string | null | undefined): string {
  const n = String(name ?? "").trim();
  if (!n) return "there";
  return n.split(/\s+/)[0];
}

// The portal's shortCode: first 8 of the ticket id, uppercased.
function shortCodeOf(ticketId: string): string {
  return String(ticketId || "").slice(0, 8).toUpperCase();
}

// The business signature — the same SIGNATURE_LINES / signatureHtml
// notify-events sends (left-logo layout, email line included).
const SIGNATURE_LINES = [
  "Austin Caudill",
  "Owner & Technician",
  "Austin's Tech Repair Group",
  "(937) 280-6243",
  "austin.caudill@austinstechrepairgroup.com",
  "austinstechrepairgroup.com",
  '"Every technology, big or small — we tackle them all."',
];
const SIGNATURE_TEXT = SIGNATURE_LINES.join("\n");

function signatureHtml(): string {
  const lines = SIGNATURE_LINES.map((l, i) =>
    i === 0 ? `<strong>${esc(l)}</strong>` : esc(l)
  ).join("<br>\n");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td style="padding-right:12px;vertical-align:top;">` +
    `<img src="${LOGO_URL}" alt="Austin's Tech Repair Group" width="64" height="64" style="border-radius:12px;display:block;">` +
    `</td><td style="vertical-align:top;">${lines}</td></tr></table>`;
}

// ---------------------------------------------------------------------
// Database lookups (service role — RLS never blocks the function)
// ---------------------------------------------------------------------

async function getTicket(sb: Admin, ticketId: string) {
  const { data, error } = await sb
    .from("tickets")
    .select("*")
    .eq("id", ticketId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getCustomer(sb: Admin, customerId: string) {
  const { data, error } = await sb
    .from("customers")
    .select("id, email, name")
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Recipient resolution — the notify-events chain, unchanged:
// ticket.customer_id -> the customers row's email; fallback to the
// denormalized tickets.customer_email. Never guesses, never falls
// back to any other person's address.
async function resolveRecipient(
  sb: Admin,
  ticket: Record<string, any> | null,
): Promise<{ email: string; name: string }> {
  let email = "";
  let name = "";
  if (ticket) {
    name = String(ticket.customer_name ?? "");
    if (ticket.customer_id) {
      const cust = await getCustomer(sb, String(ticket.customer_id));
      if (cust) {
        if (cust.email) email = String(cust.email);
        if (cust.name) name = String(cust.name);
      }
    }
    if (!email && ticket.customer_email) email = String(ticket.customer_email);
  }
  return { email: email.trim(), name: name.trim() };
}

// ---------------------------------------------------------------------
// notification_log bookkeeping (the notify-events pattern)
// ---------------------------------------------------------------------

async function insertLog(
  sb: Admin,
  row: {
    source_id: string;
    dedupe_key: string;
    recipient: string;
    subject: string;
    status: "sending" | "skipped";
    detail?: string;
  },
): Promise<string | null> {
  const { data, error } = await sb
    .from("notification_log")
    .insert({
      kind: "receipt",
      source_id: row.source_id,
      dedupe_key: row.dedupe_key,
      recipient: row.recipient,
      subject: row.subject,
      status: row.status,
      detail: row.detail ?? null,
    })
    .select("id")
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") return null;
    throw error;
  }
  return data.id as string;
}

async function finishLog(
  sb: Admin,
  id: string,
  status: "sent" | "failed",
  detail?: string,
): Promise<void> {
  const patch: Record<string, unknown> = { status, detail: detail ?? null };
  if (status === "sent") patch.sent_at = new Date().toISOString();
  const { error } = await sb.from("notification_log").update(patch).eq("id", id);
  if (error) console.error("send-receipt: could not update log row", id, error);
}

function failureDetail(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // An ambiguous SMTP outcome (timeout/reset after the server may
  // have accepted the mail) is marked failed with the ambiguity
  // noted, and is never auto-retried.
  if (/timeout|timed out|ETIMEDOUT|ECONNRESET|socket/i.test(msg)) {
    return msg +
      " (Ambiguous: Zoho may still have accepted this message. Do not resend blindly — check first.)";
  }
  return msg;
}

// ---------------------------------------------------------------------
// Sending (notify-events transport): one nodemailer connection per
// send, then closed. secure: true = implicit TLS on port 465; if
// ZOHO_SMTP_PORT is ever changed to 587 this must become false
// (STARTTLS) instead. The From address is the authenticated system
// mailbox itself, under the business display name.
// ---------------------------------------------------------------------

async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  pdf: Uint8Array;
  pdfName: string;
}): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });
  try {
    await transporter.sendMail({
      from: { name: SMTP_FROM_NAME, address: SMTP_USER },
      to: opts.to,
      replyTo: opts.replyTo,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      attachments: [
        { filename: opts.pdfName, content: opts.pdf, contentType: "application/pdf" },
      ],
    });
  } finally {
    transporter.close();
  }
}

// ---------------------------------------------------------------------
// The send
// ---------------------------------------------------------------------

async function handleSend(
  sb: Admin,
  ticketId: string,
): Promise<Response> {
  if (!SMTP_USER || !SMTP_PASSWORD) {
    return json({ ok: false, error: "not_configured" });
  }

  const ticket = await getTicket(sb, ticketId);
  if (!ticket) return json({ ok: false, error: "ticket_missing" }, 404);

  const code = shortCodeOf(ticketId);
  const subject = `Your receipt from Austin's Tech Repair Group — Ticket #${code}`;
  const resolved = await resolveRecipient(sb, ticket);
  if (!resolved.email) {
    await insertLog(sb, {
      source_id: ticketId,
      dedupe_key: `receipt:${ticketId}:${crypto.randomUUID()}`,
      recipient: "",
      subject,
      status: "skipped",
      detail: "No resolvable customer email (no email on file for this ticket's customer).",
    });
    return json({ ok: false, error: "no_email" });
  }

  // The attachment is the filed PDF — uploaded by the portal from
  // the ticket's fresh charges moments before this call. Missing
  // means the send cannot be the receipt of record, so it stops.
  const pdfPath = `${ticketId}/receipt-generated.pdf`;
  const { data: pdfBlob, error: pdfErr } = await sb.storage
    .from(DOC_BUCKET)
    .download(pdfPath);
  if (pdfErr || !pdfBlob) {
    await insertLog(sb, {
      source_id: ticketId,
      dedupe_key: `receipt:${ticketId}:${crypto.randomUUID()}`,
      recipient: resolved.email,
      subject,
      status: "skipped",
      detail: "Filed receipt PDF not found in storage (receipt-generated.pdf).",
    });
    return json({ ok: false, error: "receipt_missing" });
  }
  const pdfBytes = new Uint8Array(await pdfBlob.arrayBuffer());

  const device = deviceWording(ticket);
  const first = firstNameOf(resolved.name);
  const text = [
    `Hi ${first},`,
    "",
    `Thank you for your business. Your receipt for your ${device} repair (Ticket #${code}) is attached as a PDF.`,
    "",
    "If anything on it looks off, just reply to this email or call us at (937) 280-6243.",
    "",
    "Thank you,",
    SIGNATURE_TEXT,
  ].join("\n");
  const html = [
    `<p>Hi ${esc(first)},</p>`,
    `<p>Thank you for your business. Your receipt for your ${esc(device)} repair (Ticket #${esc(code)}) is attached as a PDF.</p>`,
    `<p>If anything on it looks off, just reply to this email or call us at (937) 280-6243.</p>`,
    `<p>Thank you,</p>`,
    signatureHtml(),
  ].join("\n");

  const logId = await insertLog(sb, {
    source_id: ticketId,
    dedupe_key: `receipt:${ticketId}:${crypto.randomUUID()}`,
    recipient: resolved.email,
    subject,
    status: "sending",
  });
  if (!logId) return json({ ok: false, error: "server_error" }, 500);

  try {
    await sendMail({
      to: resolved.email,
      subject,
      text,
      html,
      replyTo: REPLY_TO,
      pdf: pdfBytes,
      pdfName: `Receipt-${code}.pdf`,
    });
    await finishLog(sb, logId, "sent");
  } catch (err) {
    await finishLog(sb, logId, "failed", failureDetail(err));
    return json({ ok: false, error: "send_failed" });
  }
  return json({ ok: true, recipient: resolved.email });
}

// ---------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  const v = await validateCaller(req);
  if ("error" in v) return json({ ok: false, error: v.error }, v.status);

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "bad_request" }, 400);
  }
  const ticketId = typeof payload.ticket_id === "string" ? payload.ticket_id : "";
  if (!ticketId) return json({ ok: false, error: "bad_request" }, 400);

  const sb = admin();
  try {
    return await handleSend(sb, ticketId);
  } catch (err) {
    console.error("send-receipt: unhandled error", err);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
