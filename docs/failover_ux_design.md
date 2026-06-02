# ENCEPHLIAN Failover UX Design

**Audience:** clinician at small Indian neurology clinic, 10 Mbps connection, weekly-5-studies pace (Pilot SKU). Secondary: internal operator (daily-50-studies pace).
**Author:** Claude Opus 4.7 (Agent #51, 2026-06-02). Builds on Agent #33's audit findings (UX flagged vague spinners, generic "an error occurred" toasts). Aligns with `aesthetic_encephlian.md` (honesty primacy, semantic color, soft containers, density per SKU) and §9 honest-output thesis.
**Status:** Design only. Implementation requires user approval per phase.

---

## TL;DR

- **9 failure scenarios** catalogued across A/C/I/E-plane components with desired-vs-current behavior per scenario.
- **Universal time-based escalation** for spinners: <5s neutral, 5–60s amber strip with reassurance, 60s–5min named-service language with retry CTA, >5min "service offline" honest-state panel.
- **Honest copy library** drafted for both Pilot SKU (low-density, full sentence) and Internal SKU (terse, jargon-OK) — eliminates generic "an error occurred" toasts.
- **P0/P1/P2 priority split** — P0 (must ship before pilot): inline failure strip, "service offline" panel, pipeline event surfacing. P1 (first pilot week): retry-with-backoff button, "report issue" prefilled with study context.
- **6 open product questions** for the user: error categorization granularity, retry policy, customer-facing comms during outages, escalation paths, copy review owner, post-pilot internal-SKU divergence.

---

## 1. Failure Scenarios Matrix

| # | Plane / Component | What fails | How it manifests today | Desired user-visible behavior |
|---|---|---|---|---|
| 1 | C-Plane down during upload (POST `/process` after blob put) | Fire-and-forget fetch rejects; study row marked `triage_status='failed'` via `study_pipeline_events` insert | Wizard claims "Analysis running" at 100%; study card later silently shows "Failed" badge; no actionable copy | Wizard surfaces inline amber strip: "File saved, but analysis service not reachable. Your upload is safe. We'll retry automatically; you can also retry from the study page." Study card shows the *same* explanation, not generic "Failed". |
| 2 | C-Plane down during reprocess (admin/clinician triggered) | `generate_triage_report` edge function returns FunctionsHttpError; toast shows generic "Generation failed" | Toast says `err?.message` — usually unhelpful Edge error | Toast with two-line copy + "Try in 1 min" + "Report issue" buttons. Inline pipeline event log row added so the failure is permanent record, not just a transient toast. |
| 3 | I-Plane down during inference (after C-Plane succeeds) | C-Plane internally POSTs I-Plane; result is `study_pipeline_events` row with `step='iplane_invoke', status='error'`; `mind/report/{id}` 404s for hours | StudyDetail shows perpetual "processing 5%"; no honest "model service down" message | Triage progress bar transitions from blue ("processing") to amber-bordered "Models offline" panel after 5 min with no progress event. Copy: "Pre-processing complete. Model inference is currently unavailable. Your study is queued; results will resume when the service is back. No re-upload needed." |
| 4 | Read API down during viewer chunk fetch | `fetchBinary` returns `{ok:false, status:null}` → triggers EDF raw fallback (works for EDF/BDF) or sets `fatalError` (for .e/.NK) | Loading spinner for 20s, then `WifiOff` + "Viewer unavailable" without distinguishing "still processing" from "service down" | Distinguish three states explicitly: **(a) processing-not-yet-canonical** = amber soft container, ETA + pulse, no scary icon. **(b) Read API genuinely down** = "Waveform service unreachable. Showing raw EDF preview where possible. Polished viewer returns when service is back." **(c) Format unparseable + service down** = "Cannot preview yet. Recording is safe on storage." Honest about which it is. |
| 5 | Supabase down (DB unreachable) | All `useQuery` calls fail; pages render `ErrorPage` or hang | `Loader2` spinner on Dashboard, Studies list, etc. — no upper bound | Global app-shell banner: "Database connection lost. Last good fetch: 2 min ago." Existing data stays visible (cached); writes disabled with disabled buttons + tooltip "Saves disabled until database returns." Bottom-right status pill turns red. |
| 6 | Blob storage down (canonical zarr inaccessible) | Read API returns 5xx on chunk requests; meta.json 404s | Mixed with C-Plane errors; user sees viewer "unavailable" without knowing it's storage layer | Read API health endpoint surfaces `storage` status. Viewer detects `503/storage` and shows: "Storage layer issue (not your file). Your recording is safe. Try in 2 min." Distinguish from "not yet processed". |
| 7 | Azure region partial outage (central India down) | C-Plane, I-Plane, Read API, blob all in same region — typically simultaneous failure | Compounded errors, multiple toasts | Single global banner takes precedence: "Cloud region degraded. We're tracking the issue. Your in-progress work is preserved." Suppress per-component error toasts when region-level banner active. |
| 8 | Auth token expired mid-session | `supabase.auth.onAuthStateChange` fires `TOKEN_REFRESHED` automatically — most cases handled. Failure mode: refresh fails (e.g. user offline >1h) → queries return 401 | Random `dataLoadFailed` toasts | Detect 401 specifically. Show small non-blocking pill bottom-right: "Session expired. Re-sign in to continue." Click → soft sign-in modal that preserves current page state. Don't yank user to /login. |
| 9 | Edge function failure (`promote_to_v2`, `reprocess_executor`, `generate_triage_report`) | `FunctionsHttpError` with hidden body | `formatEdgeFunctionError` exists but only used inconsistently | Always pass through `formatEdgeFunctionError`. Surface as `systemFeedback.report({severity:"error", what, why, action})` not raw toast. For admin-only functions, include "Copy diagnostic" button → JSON to clipboard for support. |

---

## 2. Per-Scenario UX Spec

### Universal time-based escalation (applies to spinners)

| Elapsed | UI state | Copy |
|---|---|---|
| 0–10 s | `Loader2` spin + label | "Loading…" / "Processing…" |
| 10–30 s | Same spinner, sub-label adds estimate | "Loading…  ·  this can take 20–30 s on slower networks" |
| 30 s–2 min | Spinner persists, soft amber pill below | "Still working — server is taking longer than usual" |
| 2–5 min | Amber container replaces spinner, retry button | "This is slower than expected. We've waited 2 min. [Retry] [Continue waiting]" |
| 5 min+ | Red-soft container (NOT destructive-red), honest diagnosis | "Looks like [component] is down. Your work is saved. [Open status page] [Retry] [Report issue]" |

(Aesthetic: `amber-500/30` border + `amber-500/5` bg for in-between, `red-500/20` + `red-500/3` for confirmed-down. Never `bg-destructive` for waiting states — that's noise.)

### Concrete copy library (Pilot SKU)

```
upload_cplane_unreachable:
  what:   "File saved — analysis service not reachable"
  why:    "Your recording is safe in storage. The service that converts it for review is temporarily offline."
  action: "We'll retry automatically. No need to re-upload."
  cta:    [ "Retry now", "View study" ]
  color:  amber-soft

iplane_down_post_canonical:
  what:   "Analysis paused — models offline"
  why:    "Pre-processing finished. Model inference service is currently unreachable."
  action: "Your study stays in queue. Results resume automatically when the service returns."
  cta:    [ "View status", "Refresh" ]
  color:  amber-soft (escalates to red-soft after 30 min)

read_api_down_viewer:
  what:   "Waveform service unreachable"
  why:    "We can't load the polished waveform right now."
  action: "Showing raw EDF preview (lower fidelity). Full viewer returns when the service is back."
  cta:    [ "Try again", "Back to study" ]
  color:  amber-soft

supabase_down_global:
  what:   "Database connection lost"
  why:    "Last successful sync: {{ago}}. We're showing cached data — newer changes may be missing."
  action: "Sign-out, signing, and report saves are disabled until reconnect."
  cta:    [ "Retry now" ]  // top-of-app banner, dismissable for 5 min
  color:  red-soft

auth_expired:
  what:   "Session expired"
  why:    "Please re-sign in to continue editing."
  action: "Your changes on this page are kept until you sign back in."
  cta:    [ "Sign in" ]   // inline modal, not /login redirect
  color:  amber-soft pill, bottom-right
```

### Internal SKU variant

Same scenarios; copy is denser, monospace where IDs appear, includes correlation IDs from `study_pipeline_events.correlation_id`, exposes "Copy diagnostic JSON" button. No friendly framing — operators want fact.

---

## 3. Component Inventory

### Already-built (reuse / lightly extend)

| Component | Path | Role in failover |
|---|---|---|
| `systemFeedback` engine | `/Users/h/encephlian/src/lib/systemFeedback.ts` | Already the right shape (what/why/action). **Extend** with new prebuilt reports for each scenario above. |
| `formatEdgeFunctionError` | `/Users/h/encephlian/src/lib/edgeFunctionError.ts` | Unwraps Supabase Edge errors. **Audit:** ensure every `supabase.functions.invoke` call uses it (today, inconsistent). |
| `ErrorPage` | `/Users/h/encephlian/src/components/ErrorPage.tsx` | Full-screen fallback. **Keep** for true 404 / no-access. Not appropriate for transient outages — too final. |
| `HonestReportWrap` | `/Users/h/encephlian/src/components/report/HonestReportWrap.tsx` | Limitations panel pattern (amber border, bullet list). **Reuse aesthetic** for per-plane failover containers. |
| `StudyFlowProgress` | `/Users/h/encephlian/src/components/study/StudyFlowProgress.tsx` | 5-step pipeline indicator. **Extend** with a "failed" / "stalled" state per step (currently only handles `processing`/`done`). |
| `SystemHealthMonitor` (admin) | `/Users/h/encephlian/src/components/admin/SystemHealthMonitor.tsx` | DB + Storage + Edge polling, 30s refetch. **Reference** for adding C-Plane / I-Plane / Read API rows. Currently admin-only. |
| `useUserSession.refreshSession` | `/Users/h/encephlian/src/contexts/UserSessionContext.tsx:151` | Manual session refresh. **Wire** to the auth-expired pill's "Sign in" action. |
| `runReadApiSmoke` | `/Users/h/encephlian/src/shared/readApiSmoke.ts` | Diagnostic flow (health → meta → chunk → artifacts → annotations). **Reference** for the "Run diagnostic" button on failure screens. |
| `study_pipeline_events` insert on C-Plane trigger failure | `StudyUploadWizard.tsx:569-587` | Failure is already recorded server-side. **Read** these rows on StudyDetail to render per-step failure honestly. |
| Viewer `fatalError` + raw-EDF fallback | `SignalViewer.tsx:797-831` | Distinguishes 404 / not-yet-available. **Refactor:** also distinguish "service down" (5xx / network) from "not yet processed" (404). |

### To build (P0)

| Component | Purpose |
|---|---|
| `<PlaneStatusBanner>` | App-shell top banner; subscribes to a `usePlaneHealth()` hook; renders when any plane is degraded/down. Suppresses lower-priority component toasts. Aesthetic: `red-500/20 bg-red-500/3 border-b` for global; amber for single-plane. |
| `usePlaneHealth()` hook | Polls `/health` on C-Plane, I-Plane, Read API (every 60 s, with jitter; backoff on failure; surfaces stale-time). Pauses when tab hidden. Returns `{ cplane, iplane, readapi, supabase, lastChecked, degraded }`. |
| `<StalledStepPanel>` | Inline panel for StudyDetail that replaces the spinner once a step has been stalled >5 min. Reads latest `study_pipeline_events` row + maps step → human copy + offers retry. Amber-soft styling. |
| `<AuthExpiredPill>` | Bottom-right non-blocking pill (replaces /login redirect mid-session). Opens an inline sign-in modal preserving page state. |
| `<RetryWithBackoff>` wrapper | Generic component: takes a `useQuery` ref + label, shows the time-based escalation table above. Replaces ad-hoc `Loader2` spinners on Dashboard / Studies / Files / StudyDetail / SignalViewer. |
| `<DegradedRegionBanner>` | Special-case: if all four planes report unhealthy in same 2-min window, infer Azure region issue; show single banner instead of four. |

### To refactor (P1)

| Component | Refactor |
|---|---|
| `StudyDetail.tsx:324-328` (`state==='failed'` toast) | Replace generic "Processing failed. Check log and retry" toast with `<StalledStepPanel>` inline + targeted copy reading the latest `study_pipeline_events.step`. |
| `SignalViewer.tsx:797-831` (`fatalError` render) | Three-way split: processing / read-api-down / format-unsupported. Each gets distinct copy + color. Currently amalgamated under a single `WifiOff` icon. |
| `StudyFlowProgress.tsx:27-35` `stepIndex` | Add explicit "failed" + "stalled" variants per step. Failed step should render with red-soft styling and inline error chip. |
| Every `supabase.functions.invoke(...)` callsite | Route through `formatEdgeFunctionError` and emit via `systemFeedback.report` not raw `toast.error`. |
| `StudyUploadWizard.tsx:794-805` ("Cannot upload") | Already uses `systemFeedback` — add specific case for "auth token expired during upload" (currently treated as generic auth failure). |

### To delete

- Bare `toast.error("Generation failed")` patterns — replace with structured feedback. Counted: ≥6 occurrences in `StudyDetail.tsx` alone.

---

## 4. Implementation Priority

### P0 — Must ship before pilot

1. `usePlaneHealth()` hook + `<PlaneStatusBanner>` (every plane visible, no hidden state).
2. `<StalledStepPanel>` on StudyDetail (replaces vague spinners during processing).
3. Refactor `SignalViewer.tsx` `fatalError` render → three-way distinction (processing vs service down vs unsupported).
4. Audit all `supabase.functions.invoke` → route through `formatEdgeFunctionError` + `systemFeedback`.
5. Pre-built copy library in `systemFeedback.ts` for the 9 scenarios (PR for review with clinician).
6. Honest copy review pass: replace "Failed", "Error occurred", "Unavailable" with what/why/action triples.

### P1 — First week of pilot

7. `<RetryWithBackoff>` wrapper applied to top 5 high-traffic queries (Dashboard, Studies, StudyDetail, SignalViewer, Reports).
8. `<AuthExpiredPill>` + inline re-sign-in modal.
9. `StudyFlowProgress` "failed" + "stalled" per-step variants.
10. `<DegradedRegionBanner>` (only useful once we have telemetry).
11. Add C-Plane / I-Plane / Read API rows to `SystemHealthMonitor` admin dialog.

### P2 — Later

12. Postmortem-quality "diagnostic JSON copy" UX on failure screens (internal/admin only).
13. Per-clinic SLA "report issue" form auto-attaching last 20 `study_pipeline_events`.
14. Optimistic write queue for offline → reconnect Supabase scenarios (queues `studies` / `reports` updates locally; surfaces a "3 unsynced changes" pill).
15. PWA + service worker for true offline read of cached studies.

---

## 5. Detection Mechanisms

| Failure | How frontend detects |
|---|---|
| C-Plane down | (a) `usePlaneHealth()` polls `https://<cplane>/health` every 60 s (16 ms typical, 8 s timeout). (b) Direct: POST `/process` after upload — `fetch.catch` already writes `study_pipeline_events` row with `step='cplane_trigger', status='error'`. UI subscribes to that row via realtime channel. |
| I-Plane down | (a) `usePlaneHealth()` polls `https://<iplane>/health`. (b) `study_pipeline_events` rows from C-Plane with `step='iplane_invoke', status='error'`. (c) Indirect: `triage_status` stuck at <50% for >5 min after upload — infer stall. |
| Read API down | (a) `usePlaneHealth()` polls `<read-api>/health`. (b) `fetchJson/fetchBinary` already return `{ok:false, status:null}` on AbortError or 5xx — distinguish `status===null` (network) vs `status>=500` (server). (c) Read API exposes `azure_configured` in `/health` → surface storage-layer status. |
| Supabase down | (a) Any `useQuery` rejects with `FetchError`. Centralize in QueryClient `onError`. (b) `supabase.auth.getSession()` rejects. (c) Existing `SystemHealthMonitor.tsx:23-29` pattern (1-row `profiles` select). |
| Blob storage down | (a) Read API health shows `storage:"not configured"` or returns 503 on `/chunk.bin` with body containing `storage`/`azure` keywords. (b) Supabase storage check at `SystemHealthMonitor.tsx:35` already covers user-uploads container. |
| Azure region | All-of: C-Plane + I-Plane + Read API + blob unhealthy within 2-min sliding window → infer region. `usePlaneHealth()` exposes derived `degradedRegion` boolean. |
| Auth token expired | (a) `onAuthStateChange` event === `SIGNED_OUT` mid-session = unexpected. (b) Any Supabase query returning `code:'PGRST301'` or 401. (c) `getSession()` returns `session === null` while in authed route. |
| Edge function failure | `supabase.functions.invoke` returns `FunctionsHttpError` (already typed). Use `formatEdgeFunctionError` to extract body. |

**Polling discipline:** `usePlaneHealth()` must (a) jitter ±10 s to avoid thundering herd, (b) pause when document hidden, (c) backoff to 5-min interval after 3 consecutive failures, (d) surface "stale ≥ N min" so user knows the banner itself may be wrong.

---

## 6. Open Questions (need product input)

1. **Pilot vs Internal banner discipline:** Should pilot users *ever* see "C-Plane down" wording, or always abstracted "analysis service down"? My default = always abstracted plane names for pilot, technical names for internal. Confirm.
2. **Retry budget:** When `triage_status='failed'`, do we auto-retry from frontend, or require user click? Auto-retry risks token double-charge. Default = manual retry only; confirm.
3. **Diagnostic JSON copy-to-clipboard:** Pilot or admin/internal only? Default = internal only. (Pilot UX must stay clean.)
4. **Status page URL:** Do we have a public status page (statuspage.io / Cachet)? If yes, link from every red-soft banner. If no, P2 → build one.
5. **Read-API key rotation mid-session:** If `X-API-KEY` rotates server-side, frontend will see 401. Is that a real scenario? If yes, separate handling from token-expired (different copy).
6. **Stale data display:** When Supabase is down, do we render cached `useQuery` data with a "stale" badge, or hide it? Default = render with badge (user can still read existing reports). Confirm acceptable for signed reports.
7. **Offline-during-sign:** What happens if Supabase is down precisely when user clicks "Sign report"? Today: error toast. Options: (a) hard-block, (b) queue sign for retry, (c) show "queued" status. Need product call — there are medico-legal implications to (b).
8. **Push notifications for "back online":** When `triage_status` moves from `failed` → `processing` again after auto-retry, do we email? In-app notification? Default = `LiveAlertBanner` already exists; extend with these events.
9. **GeoRestrictionModal already exists** (`src/components/GeoRestrictionModal.tsx`) — is there a similar "region-degraded" precedent we should match aesthetically? Need to compare patterns.
10. **Banner placement vs `LiveAlertBanner`:** There's already a `LiveAlertBanner` component — `<PlaneStatusBanner>` should likely *be* that, not a parallel banner. Confirm we extend rather than add.

---

### Critical Files for Implementation

- `/Users/h/encephlian/src/lib/systemFeedback.ts` (extend with 9 scenario reports + auth-expired + region-degraded)
- `/Users/h/encephlian/src/lib/edgeFunctionError.ts` (already correct; audit all callsites)
- `/Users/h/encephlian/src/components/admin/SystemHealthMonitor.tsx` (reference pattern for `usePlaneHealth()`; extend with C/I/Read-API rows)
- `/Users/h/encephlian/src/pages/app/SignalViewer.tsx` (refactor `fatalError` block at lines 797-831 into 3-way distinction)
- `/Users/h/encephlian/src/pages/app/StudyDetail.tsx` (replace generic failed-state toast at line 324; add `<StalledStepPanel>` next to `StudyFlowProgress`)
- `/Users/h/encephlian/src/components/study/StudyFlowProgress.tsx` (add per-step failed/stalled variants to `stepIndex`)
- `/Users/h/encephlian/src/components/LiveAlertBanner.tsx` (likely the home for `<PlaneStatusBanner>` — verify before adding parallel banner)
