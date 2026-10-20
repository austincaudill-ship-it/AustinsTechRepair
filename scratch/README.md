# ATR Native Forms — JotForm replacement (staged, NOT live)

Native website forms for Austin's Tech Repair Group that write directly to the
Supabase project **atr-customer-accounts**, replacing the JotForm embeds.
Staged 2026-10-20. **Nothing in this folder is published** — see the go-live
checklist at the bottom before touching the live site.

## Files

| File | What it is |
|---|---|
| `atr-forms.js` | One module that binds to every `form[data-form]`, validates, writes to Supabase, uploads resumes to Storage, and fires the email alert. Contains the same Supabase project URL + anon (publishable) key already used by the site's `script.js` — reuse those values, do not substitute a service-role key. |
| `forms.html` | Staging file with the five copy-ready form snippets (BEGIN/END marked), using the site's existing classes (`form-field`, `field-label`, `form-success`, `btn btn-primary btn-block btn-lg`). |
| `atr-forms.css` | Only the styles `styles.css` does **not** already have: `.atr-*` layout, checkbox rows, inline errors, star rating, honeypot. |
| `README.md` | This file. |

## How it works

1. Visitor submits a form → client-side validation (inline errors under fields).
2. The submission is **inserted into Supabase** — that insert is the system of
   record and the only thing that decides success/failure in the UI.
3. In parallel (fire-and-forget, never awaited), an email alert is POSTed to
   FormSubmit's AJAX endpoint for `austin.caudill@austinstechrepairgroup.com`
   with `_subject` per form and `_template: table`, mirroring the existing
   repair-wizard lead email.
4. On success the form hides and its `.form-success` panel shows. On a database
   failure the visitor sees an error box with a call/text fallback
   (937-280-6243) — the submission is **not** silently lost behind a fake
   success.
5. Spam: each form carries a hidden honeypot field; a filled honeypot fakes a
   success and writes nothing (replaces JotForm's CAPTCHA).

Schema source of truth: `../hidden_files/supabase-phaseout-hardening.sql`
(tables `tickets`, `job_applications`, `investor_inquiries`, `feedback`;
Storage bucket `resumes`). Field catalog source:
`../hidden_files/jotform-phaseout-inventory.md`.

## ⚠️ Gotcha: inserts must use `return=minimal`

All inserts in `atr-forms.js` call supabase-js `.insert(row)` **without**
`.select()`. With no `.select()`, PostgREST sends `Prefer: return=minimal`
and does not try to return the row. The anon role has **INSERT-only** RLS
(no SELECT policy) on these tables, so an insert that asks for the row back
**fails with an RLS error even though the write itself was allowed**. If a
future edit chains `.select()` onto any of these inserts, public submissions
will break. Same rule applies to the Storage upload flow.

## ⚠️ Dependency: FormSubmit activation for the alert address

The email alert only delivers after FormSubmit's **one-time activation** for
`austin.caudill@austinstechrepairgroup.com` is completed (the activation
email's link must be clicked; the alert activates on first successful
delivery). Until that is done, **database inserts still succeed** but Austin
gets no email — test the alert explicitly during go-live (checklist below)
and do not treat a missing alert as a failed form, or a working form as proof
the alert works.

## Field mappings

### 1. Service Request → `public.tickets` (`source = 'website'`)
Replicates JotForm 261955946010055 — 22 cataloged fields.

| Form field | → Column / fate |
|---|---|
| First + Last name | `customer_name` (joined) |
| Phone | `customer_phone` |
| **Email** | `customer_email` ✅ (column added 2026-10-20) |
| Preferred Service Address (5 parts) | `service_address` (joined into one string) |
| Preferred Contact Method | `contact_method` |
| Appointment Scheduling | `appointment_at` (datetime-local → ISO timestamptz) |
| Device Category | `device_type` (options mirror the site wizard: Phone / Tablet / Computer / Game Console / Smart Watch / Business / Other) |
| Device Information (exact model) | `model` (`brand` stays null — JotForm collected brand+model as one text) |
| Repair Needed + Describe the problem | `issue` (`Repair Needed — problem text`) |
| Does it power on? | `power_on` |
| Is it backed up? | `backed_up` |
| Has it been repaired before? | `prior_repair` |
| Under manufacturer warranty? | `warranty_status` |
| Serial Number / IMEI | `serial_imei` |
| Receive Marketing Emails | `marketing_opt_in` |
| Terms and Conditions | `terms_accepted` (required to submit) |
| Dispatch Fee Acknowledgment | `dispatch_acknowledged` (required; copy states the **$15 dispatch fee is non-refundable**) |
| Work Order Authorization | `work_auth_accepted` (required) |
| "How was your experience with your service request?" (rating inside the JotForm intake) | ⚠️ **No column** — alert payload only. (Real feedback now lives in the separate Feedback form/`feedback` table.) |
| CAPTCHA | Replaced by honeypot (see above) |
| "(Dispatch Use Only)" verbal-consent checkbox | **Dropped on purpose** — staff-only field that was visible on the public JotForm; not reproduced. Austin records verbal consent in the shop, not via the public form. |
| — | `status` left to the DB default `'Waiting'`; `customer_id` left null (anonymous submission) |

Required in the native form (catalog could not confirm JotForm's flags, so the
core set was chosen): name, phone, email, device category,
repair-needed-or-problem, and the three agreement checkboxes.

### 2. Contact → `public.tickets` (`source = 'contact'`)
New native form (no JotForm original — the Contact section previously
embedded the full Service Request form).

| Form field | → Column / fate |
|---|---|
| Name | `customer_name` |
| Phone | `customer_phone` |
| **Email** | `customer_email` ✅ (column added 2026-10-20) |
| Message | `issue` |
| — | `device_type = 'Contact message'` (literal), `source = 'contact'` |

Required: name, message, and at least one of phone/email.

### 3. Job Application → `public.job_applications`
Replicates JotForm 262347488023056 — 15 cataloged fields.

| Form field | → Column / fate |
|---|---|
| Full Name (First/Last) | `full_name` |
| Email Address | `email` |
| Phone Number | `phone` |
| **Current Address** | `address` ✅ (column added 2026-10-20) |
| Position You Are Applying For | `position` |
| Highest Level of Education + Field of Study | `education` (combined: `Level — Field of study`) |
| Most Recent Employer + Job Title there | `recent_employer` (combined: `Employer — Job title`) |
| Employment Dates (Start – End) | `employment_dates` (text, as entered) |
| Briefly Describe Your Relevant Experience + Cover Letter / Additional Information | `cover_notes` (combined, each under its own label line) |
| Reference Name | `reference_name` |
| Reference Contact Information | `reference_contact` |
| Upload Your Resume | File uploaded **first** to Storage bucket `resumes` at `applications/<timestamp>-<sanitized-filename>`; `resume_url` stores that **storage path** (bucket is private — view via the Supabase dashboard/employee tools, not a public URL). 10 MB client-side limit; PDF/Word/text. |
| — | `status` left to the DB default `'New'` |

Required: first + last name, valid email, position. Resume is optional in the
form but recommended in the copy.

### 4. Investors → `public.investor_inquiries`
Replicates JotForm 262354967610058 — 8 cataloged fields.

| Form field | → Column / fate |
|---|---|
| Full Name (First/Last) | `full_name` |
| **Company Name** | `company_name` ✅ (column added 2026-10-20) |
| Investor Type | `investor_type` |
| Amount Willing to Invest (USD) | `amount_usd` (numeric; blank/invalid → null) |
| Email Address | `email` |
| Investment Focus / Interest | `focus` |
| Message / Background | `message` |
| "Connect me with Austin's Tech Repair Group" consent | `consent_contact` ✅ (column added 2026-10-20) |
| — | `phone` stays null (the JotForm form collects no phone); `status` default `'New'` |

### 5. Feedback ("How Did We Do") → `public.feedback`
Native build for the JotForm "How Did We Do Today?" form — its field list was
**never cataloged** (no form ID/URL exists in the workspace; see inventory
§2.4), so this form is built to the table + Austin's stated use (attached to
the Google-review request email).

| Form field | → Column |
|---|---|
| Rating (1–5 stars) | `rating` (int) — required |
| How was your experience overall? | `experience` |
| Would you recommend us? (Yes/No) | `would_recommend` — required |
| Comments | `comments` |
| Your name (optional) | `customer_name` |
| Email (optional) | `customer_email` |

The success panel also shows the site's existing "Review us on Google"
button, so the feedback flow doubles as the review funnel.

## Inserting the snippets into the live pages (later, surgical step)

The local `~/workspace/website-redesign/` copies are **stale** vs. live —
always edit the live files (GitHub web UI route), never publish these local
files wholesale.

1. **Assets**: add `atr-forms.js` and `atr-forms.css` to the repo root
   alongside `script.js`/`styles.css`. In `index.html`:
   - `<link rel="stylesheet" href="atr-forms.css">` after the `styles.css` link.
   - `<script src="atr-forms.js"></script>` after the existing supabase-js CDN
     script tag and after `script.js` (the page already loads
     `@supabase/supabase-js@2` from jsDelivr; `atr-forms.js` reuses
     `window.supabase` when present and lazy-loads the same CDN otherwise).
2. **Service Request snippet** → Contact section: replace the
   `<script src="https://form.jotform.com/jsform/261955946010055"></script>`
   inside `#contact .form-embed` with the `service-request` snippet
   (keep the `.form-embed` wrapper).
3. **Post-wizard intake link**: in the `#repair-success` panel, the button
   "Or complete the full intake form" currently links to
   `https://form.jotform.com/261955946010055` — repoint it to `#contact`
   (where the native Service Request form now lives) and relabel, or drop it.
4. **Contact snippet** → Contact section as the quick-message option.
   ⚠️ Placement decision still open for the publish step: suggested layout is
   the full Service Request form first (it is the canonical intake), with the
   Contact snippet below it under a "Just have a quick question?" heading —
   or swap which one leads. Confirm with Austin at publish time.
5. **Job Application snippet** → Careers section: replace the
   `jsform/262347488023056` script inside `#careers .form-embed`.
6. **Investors snippet** → Investors section: replace the
   `jsform/262354967610058` script inside `#investors .form-embed`.
7. **Feedback snippet** → not currently on the site. Publish it at a stable
   URL/anchor (e.g. its own section or page) so the Google-review request
   email can link straight to it — that email attachment/link is its primary
   use (Austin's 2026-10-20 request).
8. **Cleanup after verification** (not before): remove the JotForm AI agent
   ("Steve") script before `</body>`, update the Privacy Policy line that
   names JotForm ("Our site uses Jotform for intake forms…"), and retire the
   now-dead `.form-embed iframe` CSS if no embeds remain.

## Go-live verification checklist (all must pass BEFORE removing JotForm embeds)

- [ ] Hardening SQL is live: the three new tables + `tickets` columns exist,
      `resumes` bucket exists, and anon has INSERT-only policies (no
      "Allow all for everyone" left).
- [ ] FormSubmit activation for the alert address is completed — send one
      real submission and confirm the alert email actually arrives in the
      business Zoho inbox (DB success alone does **not** prove the alert).
- [ ] Submit a test of **each** of the five forms on the live site; confirm
      the success panel shows for each.
- [ ] Confirm each test row appears correctly in Supabase (Table Editor /
      employee view): right table, right columns, `source` set
      (`website`/`contact`), agreements stored as `true`, appointment
      converted to a sane timestamp.
- [ ] Job Application: upload a real resume file; confirm the object exists
      in the `resumes` bucket at `applications/…` and that exact path is in
      `resume_url`. Confirm the bucket is **not** publicly readable.
- [ ] Confirm the anon key **cannot read** submissions back (e.g. a REST
      `GET` on `job_applications` with the anon key returns no rows) —
      proves INSERT-only RLS is doing its job.
- [ ] Confirm a forced failure path looks right (e.g. submit with the
      database unreachable in a test environment) — error box with the
      937-280-6243 fallback, no fake success.
- [ ] Confirm validation blocks empty/invalid submits inline on every form
      (including the three agreement checkboxes on Service Request).
- [ ] Check all five forms on a phone-width viewport — the `.atr-*` grid
      collapses to one column and the star rating is tappable.
- [ ] Only then: remove the three jsform embeds + the post-wizard JotForm
      link per the insertion steps, and update the Privacy Policy JotForm
      mention.
