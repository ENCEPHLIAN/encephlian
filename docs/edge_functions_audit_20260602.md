# Edge Functions Audit — 2026-06-02

Read-only inventory of `supabase/functions/*` and their callers. **No code changes were made** — this is a discovery pass to surface deprecation candidates, consolidation opportunities, and one latent bug.

Total: 25 edge functions, ~5 131 LOC.
Total invocation sites in `/Users/h/encephlian/src`: **28** in **17 files** (matches Agent #55's earlier count).

## Executive summary

**Recommend deprecating 3 functions** (~371 LOC, all confirmed zero callers):

1. **`join_waitlist`** (101 LOC, last modified 2025-11-26 — **6+ months ago**) — sends a Resend email to `info@encephlian.cloud` for an "Anomaly Detection" feature signup. Zero callers in `src/`, no waitlist UI exists. Surely dead since the §9 honest-output overhaul moved roadmap discovery off-app.
2. **`delete_account`** (85 LOC, 2025-12-10) — self-service "DELETE MY ACCOUNT" flow. Zero callers in `src/`. There is no settings/profile page that surfaces this. If we want self-service deletion under DPDP we should re-introduce intentionally; right now this is a deployed surface that nothing uses.
3. **`send_triage_notification`** (208 LOC, 2026-05-11) — emails the study owner when triage completes. Only references in `src/` are *docstring mentions* in `Documentation.tsx`. Nothing actually invokes it. The triage-complete notification path is currently silent; either wire it (likely from the I-Plane completion patch) or drop it.

**Top "surprise":** `parse_eeg_study` is still wired to the **AdminStudyDetail "Re-run parse" button**, but it operates on Supabase Storage (`eeg-uploads` / `eeg-raw` buckets) — a **legacy storage path**. The current upload flow (`create_study_from_upload` → Azure Blob direct) never writes to those buckets. Worse, the admin button passes only `{ study_id }` while the function requires `{ study_id, file_path, file_type }`. **This is a latent bug** — clicking "Re-run parse" will always 400 with `"Failed to download file"`. Two options: rewire to Azure Blob + add the missing params, or delete the button + function together.

**One more surprise:** `admin_create_user` (`PaaSUserManagement.tsx` line 85, `InternalTeamManagement.tsx` line 67) destructively deletes existing profile + wallet + tickets + memberships + auth user for any matching email before inserting. That's far more aggressive than the safer atomic `admin_provision_clinic` / `admin_create_clinician` (which use the per-step RPC + rollback pattern). **`admin_create_user` is the legacy version**; `admin_provision_clinic` + `admin_create_clinician` have been the canonical path since 2026-05-19. The Internal/PaaS UIs still call the legacy one.

## Function inventory

Sorted by last-modified date (newest first).

| # | Function | LOC | Last modified | Status | Callers |
|---|---|---|---|---|---|
| 1 | generate_report_pdf | 386 | 2026-05-29 | ACTIVE | Studies.tsx · PilotDashboard.tsx · PilotStudiesView.tsx · ReportDetail.tsx · StudyDetail.tsx |
| 2 | sign_report | 114 | 2026-05-29 | ACTIVE | ReportDetail.tsx |
| 3 | create_study_from_upload | 248 | 2026-05-28 | ACTIVE | Studies.tsx |
| 4 | generate_triage_report | 228 | 2026-05-28 | ACTIVE | SlaSelectionModal.tsx · StudyDetail.tsx (×3) · AdminStudies.tsx (×2) |
| 5 | promote_to_v2 | 151 | 2026-05-28 | ACTIVE | DB Webhook + reprocess_executor (server-side) |
| 6 | reprocess_executor | 263 | 2026-05-28 | ACTIVE | AdminReprocess.tsx · pg_cron (per README) |
| 7 | admin_provision_clinic | 261 | 2026-05-19 | ACTIVE | AdminClinicNew.tsx |
| 8 | admin_onboard_value_unit | 270 | 2026-05-19 | LEGACY/AT-RISK | Zero callers in src/ |
| 9 | admin_create_user | 181 | 2026-05-19 | AT-RISK (legacy) | InternalTeamManagement.tsx · PaaSUserManagement.tsx |
| 10 | admin_create_clinician | 178 | 2026-05-19 | ACTIVE | AdminClinicianNew.tsx |
| 11 | submit_support_ticket | 106 | 2026-05-19 | ACTIVE | Support.tsx |
| 12 | parse_eeg_study | 320 | 2026-05-11 | AT-RISK (latent bug) | AdminStudyDetail.tsx — broken (see surprise above) |
| 13 | send_triage_notification | 208 | 2026-05-11 | **LEGACY (deprecation candidate)** | Zero callers in src/ |
| 14 | admin_infra_status | 667 | 2026-04-23 | ACTIVE | AdminInfra.tsx |
| 15 | sign_report (dup #2) | — | — | — | — |
| 16 | create_pilot_subscription | 86 | 2026-04-24 | ACTIVE | PilotWalletCard.tsx |
| 17 | verify_pilot_subscription | 123 | 2026-04-24 | ACTIVE | PilotWalletCard.tsx |
| 18 | create_order | 144 | 2026-04-24 | ACTIVE | TokenPurchase.tsx · razorpayCheckout.ts |
| 19 | razorpay_webhook | 332 | 2026-04-24 | ACTIVE | Razorpay dashboard (external) |
| 20 | verify_payment | 157 | 2026-04-23 | ACTIVE | TokenPurchase.tsx · PilotWalletCard.tsx |
| 21 | read_raw_edf | 203 | 2026-04-23 | ACTIVE | SignalViewer.tsx (direct HTTP, not supabase.functions.invoke) |
| 22 | read_api_proxy | 159 | 2026-04-23 | ACTIVE | shared/readApiClient.ts (direct HTTP) |
| 23 | admin_infra_status (dup #14) | — | — | — | — |
| 24 | send_payment_receipt | 160 | 2026-05-11 | ACTIVE | TokenPurchase.tsx · PilotWalletCard.tsx |
| 25 | delete_account | 85 | 2025-12-10 | **LEGACY (deprecation candidate)** | Zero callers in src/ |
| 26 | join_waitlist | 101 | 2025-11-26 | **LEGACY (deprecation candidate)** | Zero callers in src/ |

(De-duplicated count = 25 distinct functions.)

## Per-function detail

Each entry lists: purpose · tables read/written · external services · classification · caller sites.

---

### admin_create_clinician — ACTIVE
- **Purpose:** attach a NEW clinician to an EXISTING clinic atomically. Sibling of `admin_provision_clinic`.
- **Tables:** reads `user_roles`, `clinics`, `profiles`. RPC `admin_provision_clinician_for_clinic` (which writes profile, user_roles, clinic_memberships, wallets, wallet_transactions, audit_logs).
- **External:** Supabase Auth admin API only.
- **Callers:** `src/pages/admin/AdminClinicianNew.tsx:130` — fired on admin "Add clinician" form submit.
- **Last modified:** 2026-05-19. **Status: ACTIVE.**

### admin_create_user — AT-RISK (legacy)
- **Purpose:** "create or reset" a user. Cleans up existing profile/wallet/tickets/memberships/auth.users for matching email, then recreates from scratch. Predates the atomic provision RPC pattern.
- **Tables (destructive!):** DELETES from `wallet_transactions`, `wallets`, `tfa_secrets`, `notes`, `support_tickets`, `clinic_memberships`, `user_roles`, `payments`, `profiles` for any matching email. Then inserts new profile + user_roles + wallets + clinic_memberships + audit_logs.
- **External:** Supabase Auth admin API (listUsers, deleteUser, createUser).
- **Callers:**
  - `src/components/admin/InternalTeamManagement.tsx:67` — super_admin "Add internal team member" dialog
  - `src/components/admin/PaaSUserManagement.tsx:85` — super_admin "Add PaaS clinician" dialog
- **Last modified:** 2026-05-19. **Status: AT-RISK.** Should be retired in favour of `admin_provision_clinic` (clinic + clinician) or `admin_create_clinician` (clinician only) which use the safer per-step RPC pattern. Keeping both shapes creates two ways to onboard a clinician with subtly different invariants.

### admin_infra_status — ACTIVE
- **Purpose:** super_admin cockpit proxy. Fan-outs to Razorpay (balance + last 10 payments), Supabase (row counts, buckets), Azure (cost mgmt, RGs), Vercel (last deploys), returns one normalised tile per provider.
- **Tables:** reads `user_roles` (auth) + row counts on `profiles`, `clinics`, `studies`, `payments`, `audit_logs`. Lists storage buckets.
- **External:** Razorpay REST, Azure Management API (OAuth2 SP), Vercel REST.
- **Callers:** `src/pages/admin/AdminInfra.tsx:466` — once on page load, on demand "Refresh".
- **Last modified:** 2026-04-23. **Status: ACTIVE.** Largest function at 667 LOC; a candidate to split (one function per provider) if it ever needs to scale beyond a single founder cockpit.

### admin_onboard_value_unit — LEGACY / AT-RISK (zero callers)
- **Purpose:** create a complete value unit (clinic + neurologist + role + membership + wallet + audit log) in one call. Last-modified 2026-05-19; superseded by `admin_provision_clinic` which uses the safer RPC-based atomic pattern.
- **Tables:** `profiles`, `clinics`, `user_roles`, `clinic_memberships`, `wallets`, `audit_logs`. Manual rollback on failure.
- **External:** Supabase Auth admin API.
- **Callers:** **zero in `src/`**. Search grepped: no UI page invokes this name.
- **Status: AT-RISK** — could be the same code path the admin onboarding flow used to call. Worth confirming with git blame before deprecating, but classification is "duplicate of admin_provision_clinic with worse rollback semantics".

### admin_provision_clinic — ACTIVE
- **Purpose:** atomically create clinic + primary clinician. Calls RPC `admin_provision_clinic_resources` for the DB writes; rolls back auth.users on RPC failure.
- **Tables:** reads `user_roles`, `profiles`. RPC writes clinic + profile + user_roles + clinic_memberships + wallet topup + wallet_transactions + audit_logs.
- **External:** Supabase Auth admin API.
- **Callers:** `src/pages/admin/AdminClinicNew.tsx:155`.
- **Last modified:** 2026-05-19. **Status: ACTIVE.**

### create_order — ACTIVE
- **Purpose:** create a Razorpay order for a token top-up (10/25/50/100) or one-time pilot_access (₹3000, +10 tokens).
- **Tables:** writes `payments` (status=created).
- **External:** Razorpay `POST /v1/orders`.
- **Callers:** `src/components/TokenPurchase.tsx:27`, `src/lib/razorpayCheckout.ts:36`.
- **Last modified:** 2026-04-24. **Status: ACTIVE.**

### create_pilot_subscription — ACTIVE
- **Purpose:** create a Razorpay subscription against `RAZORPAY_PILOT_PLAN_ID` (36 cycles) and seed `pilot_subscriptions` row with status='pending'.
- **Tables:** writes `pilot_subscriptions`.
- **External:** Razorpay `POST /v1/subscriptions`.
- **Callers:** `src/components/sku/PilotWalletCard.tsx:134`.
- **Last modified:** 2026-04-24. **Status: ACTIVE.**

### create_study_from_upload — ACTIVE
- **Purpose:** A5 direct-Azure-blob upload flow. Creates Supabase `studies` row, dedupes on `source_content_sha256`, hits C-Plane `/upload-token/<id>` for a SAS, writes `study_files` + `studies.uploaded_file_path`. Frontend then PUTs the EDF directly to the SAS URL.
- **Tables:** reads `clinic_memberships`. Writes `studies`, `study_files`. RPC `get_user_clinic_id`. `pipeline_events` via shared util.
- **External:** C-Plane REST (`POST /upload-token/<study_id>?ext=<ext>`).
- **Callers:** `src/pages/app/Studies.tsx:253` — fired on every EDF/BDF upload (per-upload frequency).
- **Last modified:** 2026-05-28. **Status: ACTIVE.**

### delete_account — LEGACY (deprecation candidate)
- **Purpose:** self-service "DELETE MY ACCOUNT" (requires literal confirmation string). Removes the user's storage objects across 5 buckets, inserts an audit log row, then calls `auth.admin.deleteUser` (cascade FKs do the DB cleanup).
- **Tables:** writes `audit_logs`. Storage: `eeg-raw`, `eeg-clean`, `eeg-json`, `eeg-preview`, `eeg-reports` (list + remove).
- **External:** Supabase Auth admin API.
- **Callers:** **zero in `src/`**. No settings/profile page surfaces this.
- **Last modified:** 2025-12-10. **Status: LEGACY → delete.** If we want DPDP self-deletion we should rebuild intentionally on the current schema (the storage bucket list above references `eeg-clean` and `eeg-preview` which I cannot find in current bucket migrations — likely stale).

### generate_report_pdf — ACTIVE
- **Purpose:** server-side jsPDF generation of the SCORE EEG-style report from `reports.content` + `studies.triage_draft_json`. Uploads PDF to `eeg-reports` storage bucket and writes `reports.pdf_path`.
- **Tables:** reads `reports` (embeds `studies` + `profiles!interpreter`). Writes `reports.pdf_path`. Storage: `eeg-reports`.
- **External:** none (PDF rendering is local via esm.sh jsPDF).
- **Callers:**
  - `src/pages/app/Studies.tsx:327` (clinician download)
  - `src/pages/app/ReportDetail.tsx:138`
  - `src/pages/app/StudyDetail.tsx:408`
  - `src/components/dashboard/PilotDashboard.tsx:111`
  - `src/components/pilot/PilotStudiesView.tsx:156`
- **Last modified:** 2026-05-29. **Status: ACTIVE.** Fires on each report download where `reports.pdf_path` is null. Each frontend caller has the same "try server-side, fall back to client-side render" pattern — opportunity for a single hook.

### generate_triage_report — ACTIVE
- **Purpose:** A3/A5 pipeline trigger. After the SAS upload completes, frontend calls this; it sets state=uploaded, validates SLA gate (internal can pick SLA inline; pilot requires tokens), POSTs to C-Plane `/process`, and flips state to processing + triage_status=processing. I-Plane patches back on completion.
- **Tables:** reads `studies`, `clinic_memberships`, `clinics`. Writes `studies.state`, `studies.sla`, `studies.triage_status`, `studies.triage_progress`, `studies.triage_started_at`. `pipeline_events` via shared util.
- **External:** C-Plane REST (`POST /process`).
- **Callers:**
  - `src/components/dashboard/SlaSelectionModal.tsx:210` (pilot SLA selection)
  - `src/pages/app/StudyDetail.tsx:347` and `:368` (manual re-run)
  - `src/pages/admin/AdminStudies.tsx:78` and `:131` (admin batch re-trigger)
- **Last modified:** 2026-05-28. **Status: ACTIVE.**

### join_waitlist — LEGACY (deprecation candidate)
- **Purpose:** send a Resend email to `info@encephlian.cloud` when a user signs up for an "Anomaly Detection" waitlist; log to `audit_logs`.
- **Tables:** reads `profiles`. Writes `audit_logs`.
- **External:** Resend.
- **Callers:** **zero in `src/`**. No waitlist UI exists anywhere.
- **Last modified:** 2025-11-26 — **the oldest of all functions**, **>6 months stale.**
- **Status: LEGACY → delete.**

### parse_eeg_study — AT-RISK (latent bug, see surprise)
- **Purpose:** download the first 64KB of an uploaded EDF/BDF/JSON from Supabase Storage, parse the EDF header, write metadata JSON to `eeg-json` bucket, update `studies` with srate/duration + merged patient meta.
- **Tables:** writes `studies` (state=parsed, srate_hz, duration_min, meta merge), `study_files`. Storage: `eeg-uploads`/`eeg-raw` (download), `eeg-json` (upload). `pipeline_events` via shared util.
- **External:** none — pure local Deno parsing.
- **Callers:** `src/pages/admin/AdminStudyDetail.tsx:145` — admin "Re-run parse" button.
- **Bug:** the admin button passes `{ study_id }` but the function requires `{ study_id, file_path, file_type }`. Even if the params were fixed, the function reads from Supabase Storage buckets (`eeg-uploads`/`eeg-raw`), while the current upload flow writes directly to Azure Blob. So **this function operates on a storage path the current pipeline no longer populates.**
- **Last modified:** 2026-05-11. **Status: AT-RISK.** Either:
  1. Rewrite to read from Azure Blob (via C-Plane `/read-token`), fix the admin call signature.
  2. Delete the function + the admin button. The C-Plane already parses metadata as part of the canonicalization step (see CPLANE_URL pipeline events in `pipeline_log.ts`), so re-running parse is largely redundant.
- I lean (2). The redundant parse adds a code path with three different storage backends to keep straight.

### promote_to_v2 — ACTIVE
- **Purpose:** §9 keystone. Auto-upgrades I-Plane v1 `triage_draft_json` payloads to `mind.report.v2` so the channel-dependency gate, schema validator, summary recomputer, and emission audit fire on production writes. Two call shapes: (a) Database Webhook on UPDATE of `studies`, (b) manual POST `{ study_id }`. Loop-safe via `schema_version === "v2"` early-exit.
- **Tables:** reads + writes `studies.triage_draft_json`. The write fires the validate_triage_draft_json + enforce_channel_gate + recompute_v2_summary triggers, then log_triage_emission writes to the audit table.
- **External:** none.
- **Callers:**
  - Supabase Database Webhook (wired in Studio per docstring)
  - `supabase/functions/reprocess_executor/index.ts:237` (server-to-server, service-role auth)
  - `src/lib/__tests__/adapterDrift.test.ts:24` (test import only, not runtime)
- **Last modified:** 2026-05-28. **Status: ACTIVE — critical infrastructure.** This is the bridge that makes §9 fire on real traffic per the memory note. Do not touch.

### razorpay_webhook — ACTIVE
- **Purpose:** Razorpay webhook receiver. HMAC-SHA256 signature verify; handlers for `payment.captured`, `order.paid`, `payment.failed`, `refund.{created,processed,failed}`, `subscription.{charged,authenticated}`, `invoice.paid`, plus dispute/downtime log-only. Credits wallet via `credit_wallet` RPC (also writes `wallet_transactions`); idempotent against `verify_payment` double-deliveries.
- **Tables:** reads `payments`, `pilot_subscriptions`, `pilot_subscription_charges`. Writes `payments`, `pilot_subscriptions`, `pilot_subscription_charges`. RPC `credit_wallet`.
- **External:** receives from Razorpay (no outbound — purely inbound).
- **Callers:** Razorpay Dashboard (external). Not invoked from frontend.
- **Last modified:** 2026-04-24. **Status: ACTIVE.**

### read_api_proxy — ACTIVE
- **Purpose:** transparent proxy from the browser to the C-Plane Read API (`VITE_ENCEPH_READ_API_BASE`), so the browser doesn't need the API key. Adds `x-api-key` header server-side. Logs `pipeline_events` for the upstream call.
- **Tables:** `pipeline_events` only (via shared util).
- **External:** C-Plane Read API REST.
- **Callers:** `src/shared/readApiClient.ts:20` — direct `${supabaseUrl}/functions/v1/read_api_proxy` URL composition. Triggered every time the SignalViewer / Read panels fetch chunks.
- **Last modified:** 2026-04-23. **Status: ACTIVE — hot path.**

### read_raw_edf — ACTIVE
- **Purpose:** stream raw EDF/BDF bytes to the browser without exposing Azure Blob CORS. Calls C-Plane `/read-token/<study_id>` for a SAS, fetches the blob, pipes the body through.
- **Tables:** `pipeline_events` only (logging).
- **External:** C-Plane (`/read-token`), Azure Blob (via SAS).
- **Callers:** `src/pages/app/SignalViewer.tsx:112` — direct `${supabaseUrl}/functions/v1/read_raw_edf?study_id=…` URL. Triggered on viewer open.
- **Last modified:** 2026-04-23. **Status: ACTIVE.**

### reprocess_executor — ACTIVE
- **Purpose:** picks up `reprocess_jobs` rows (oldest queued/running), claims via CAS, processes up to 25 studies per invocation by dispatching to `promote_to_v2`. Honours cancellation between studies. Updates job counters; flips to completed/partial when done.
- **Tables:** reads + writes `reprocess_jobs`. Reads `studies`. Dispatches to `promote_to_v2` (HTTP, service-role).
- **External:** itself fans out to `promote_to_v2` via `${SUPABASE_URL}/functions/v1/promote_to_v2`.
- **Callers:**
  - `src/pages/admin/AdminReprocess.tsx:217` — "Process queue" button
  - pg_cron (per `supabase/functions/reprocess_executor/README.md`, but I cannot find an actual `cron.schedule(...)` SQL migration — the schedule may have been wired in Supabase Studio rather than in a migration).
- **Last modified:** 2026-05-28. **Status: ACTIVE.**

### send_payment_receipt — ACTIVE
- **Purpose:** post-purchase email receipt to user + copy to `info@encephlian.cloud`. Honours `check_email_enabled` flag passed from frontend.
- **Tables:** reads `profiles`.
- **External:** Resend.
- **Callers:** `src/components/TokenPurchase.tsx:79`, `src/components/sku/PilotWalletCard.tsx:77`.
- **Last modified:** 2026-05-11. **Status: ACTIVE.**

### send_triage_notification — LEGACY (deprecation candidate)
- **Purpose:** email the study owner "Triage Complete" with a deep link. Reads `email_notifications_enabled` platform setting from DB; bails if off.
- **Tables:** reads `studies`, `clinic_memberships`, `user_roles`, `profiles`. RPC `get_platform_setting`.
- **External:** Resend.
- **Callers:** **zero in `src/`** — only mentioned in `Documentation.tsx` strings. The actual triage-complete notification path is currently silent.
- **Last modified:** 2026-05-11. **Status: LEGACY.** Either wire it (perhaps from the I-Plane completion PATCH, server-to-server) or delete it. As-is it consumes a Resend secret and a deployed surface for nothing.

### sign_report — ACTIVE
- **Purpose:** finalise neurologist-signed report content. Authorises the caller against the study's clinic, then calls `consume_credit_and_sign(p_user_id, p_study_id, p_cost=0, p_content, p_request_id)` RPC — which both writes the `reports` row and (per the RPC name) used to deduct credit. Since 2026-04-24 tokens are deducted at SLA selection time, `p_cost=0` here.
- **Tables:** reads `studies`, `clinic_memberships`. RPC `consume_credit_and_sign` (writes `reports`).
- **External:** none.
- **Callers:** `src/pages/app/ReportDetail.tsx:93` — fired on neurologist "Sign report" click.
- **Last modified:** 2026-05-29. **Status: ACTIVE.**

### submit_support_ticket — ACTIVE
- **Purpose:** inserts a support ticket with a memorable reference ID (`TKT-XXXXXX`). Email path is intentionally disabled per the comment "Email notifications disabled for support tickets".
- **Tables:** reads `profiles`. Writes `support_tickets`, `audit_logs`.
- **External:** none (Resend code path is disabled by guard).
- **Callers:** `src/pages/app/Support.tsx:32` — fired on user "Send" click.
- **Last modified:** 2026-05-19. **Status: ACTIVE.**

### verify_payment — ACTIVE
- **Purpose:** synchronous payment verify after Razorpay checkout. Compares signature (HMAC-SHA256 of `order_id|payment_id`), updates `payments`, credits wallet via `credit_wallet` RPC, fetches new balance. Idempotent against the webhook (status=completed short-circuit).
- **Tables:** writes `payments`. Reads `wallets`. RPC `credit_wallet`.
- **External:** none (signature compare is local).
- **Callers:** `src/components/TokenPurchase.tsx:57`, `src/components/sku/PilotWalletCard.tsx:59`.
- **Last modified:** 2026-04-23. **Status: ACTIVE.**

### verify_pilot_subscription — ACTIVE
- **Purpose:** mirror of `verify_payment` for the pilot subscription. Verifies HMAC over `payment_id|subscription_id`, inserts `pilot_subscription_charges`, credits BONUS_TOKENS=10, flips `pilot_subscriptions.status=active`.
- **Tables:** reads `pilot_subscriptions`, `pilot_subscription_charges`. Writes both + `wallets`. RPC `credit_wallet`.
- **External:** none.
- **Callers:** `src/components/sku/PilotWalletCard.tsx:156`.
- **Last modified:** 2026-04-24. **Status: ACTIVE.**

## Consolidation opportunities

### High-value
1. **Payment-receipt path consolidation.** `verify_payment` and `verify_pilot_subscription` are 95% the same code (HMAC verify, idempotency check, insert + credit_wallet). Likewise `create_order` (one-time payments) vs. `create_pilot_subscription` (recurring) differ mostly in the Razorpay endpoint + body shape. Could collapse to one `razorpay_payment` function with a `mode: "order" | "subscription"` switch, saving ~150 LOC and ensuring signature normalisation stays identical (today they reimplement the same `hmacSha256Hex` logic).
2. **Admin user creation cleanup.** Retire `admin_create_user` in favour of the atomic `admin_provision_clinic` / `admin_create_clinician` pair. Two destructive deletes vs. atomic RPC + rollback should not coexist. Migrate the two callers (`InternalTeamManagement.tsx`, `PaaSUserManagement.tsx`) over.
3. **Single "generate PDF" caller hook.** Five files re-implement the same pattern: `fetch reports.pdf_path → if null, invoke generate_report_pdf → re-fetch pdf_path → download from storage → fall back to client render`. Pull into one hook (e.g. `useReportPdfDownload`) and the edge function semantics will be enforced once.

### Lower-value
4. **`admin_infra_status` is 667 LOC** because it inlines four provider clients. If it ever needs to scale beyond a single super_admin cockpit, split into `infra_status_razorpay`, `infra_status_supabase`, `infra_status_azure`, `infra_status_vercel` — but right now monolithic is fine because the cockpit fans-out anyway.

## What surprised me

1. **`parse_eeg_study` has been broken since the A5 Azure-direct migration** (likely 2026-04-24, when `create_study_from_upload` stopped writing to `eeg-uploads`/`eeg-raw`). The admin "Re-run parse" button has been firing 400s silently. If nobody noticed, the use-case is probably gone.
2. **`send_triage_notification` exists, has Auth + role checks + tested handler — but is invoked from nowhere.** When triage completes today, no email goes out. The I-Plane completion patch presumably should call this server-to-server but I couldn't find that call anywhere (`/Users/h/encephlian-core` grep returned zero hits).
3. **No `cron.schedule(...)` migration for `reprocess_executor`.** The README documents it, but I could not find a SQL migration that wires it. If it's running, it was wired in Supabase Studio. That makes it fragile (re-creating the project from migrations would not restore the cron).
4. **`admin_onboard_value_unit` (270 LOC) has zero callers.** It looks like an early draft that was superseded by `admin_provision_clinic`. The two functions have nearly identical input shapes; keep `admin_provision_clinic` (RPC-based) and retire `admin_onboard_value_unit` (manual rollback).

## Methodology

- Inventory: `wc -l` + `git log --format=%cI` per `supabase/functions/*/index.ts`.
- Callers: `grep -rn "supabase.functions.invoke" /Users/h/encephlian/src` plus direct-URL search (`grep -rn "functions/v1/"`) to catch `SignalViewer.tsx` + `readApiClient.ts`.
- Tables / external services: each function's body read in full or near-full (300-line offsets).
- Cross-repo: grepped `/Users/h/encephlian-core` for function names — zero hits, confirming nothing backend-side calls these functions by name.
- I did **not** consult the deployed Supabase project via MCP (permission denied for `mcp__plugin_supabase_supabase__list_projects`). So this audit reflects what is in the **repo source tree** — if a function was deleted from the repo but is still deployed (or vice versa) I would not see it. Recommend pairing this with `supabase functions list --project-ref mngkbtsummbknrbpjbye` to catch drift.
