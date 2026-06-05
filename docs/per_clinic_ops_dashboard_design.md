# Per-Clinic Operations Dashboard — Design Document

**Author:** planning agent, 2026-06-05
**Status:** Design only. No code changes implemented. User approval required before any phase ships.
**Scope:** A new dashboard surface for the canonical `management` role, scoped to *their own clinic*. Sits in the `/admin/*` route tree but renders different content than `super_admin` sees — it never reveals cross-clinic data.
**Companion docs:** `docs/pilot_internal_split_design.md` (route tree + SKU split); `docs/failover_ux_design.md` (honest failure surfaces); `docs/postmortem_vigil_clean_v2.md` (honesty primacy); `encephlian-core/docs/edit_delta_retraining_design.md` (clinician edit deltas as the canonical "clinician disagreement" signal); `encephlian-core/docs/ENCEPHLIAN_ARCHITECTURE_v2.2.md` (four-plane context).
**Honest caveat:** Several panels assume signal volumes (a clinic doing ~5 studies/week on pilot) that we will not actually see until the pilot has accumulated weeks of data. Threshold defaults and aggregation windows below are conservative starting points, tagged as such.

---

## TL;DR

- **A new dashboard surface for the `management` role**, scoped to one clinic. `super_admin` still sees the cross-clinic view at `/admin`; `management` at `/admin` is rewritten to the per-clinic view defined here. The role enum stays exactly `super_admin | management | clinician` — no new roles.
- **Seven panels**: throughput, pipeline health, signal quality, clinician utilization, wallet (where applicable), recent activity, "what we don't know yet" honesty footer. Each panel has an explicit empty state.
- **No clinical data, no patient identifiers in aggregate panels.** Management is an operator, not a clinician. PHI is reachable only by drilling into individual study pages, where the existing RLS applies unchanged.
- **No hardcoded model metrics.** Anything model-shaped (AUC, accuracy, version) reads from `model_versions` + `model_validation_runs`. If no validation row exists for a model the clinic relies on, the panel says so honestly (Vigil/Clean v2 lesson, see postmortem).
- **Density tracks SKU.** `pilot` clinics see a low-density single-column view (5 studies/week — most panels show "still gathering data" for the first month); `internal` gets full chrome; `prod` gets the pilot layout once we have one.
- **RLS, not application-layer filtering.** Cross-clinic comparison ("how do we compare to other clinics in your tier?") is a *separate* aggregated RPC that returns anonymized buckets — never per-clinic identities. P2.
- **Poll, don't subscribe (mostly).** Recommended cadence: 30s `refetchInterval` on TanStack Query, plus a single Supabase realtime channel for `studies` state changes only. Avoid wiring realtime to every panel — it triples connection cost for marginal value.
- **6 open product questions** in §12: what counts as "satisfaction" for management, billing escalation logic, daily-digest email, owner of the "honest unknown" copy.

---

## 1. Audience + scope

### Who is the `management` user?

The `management` role today is what the codebase treats as an "admin who is not super_admin." Concretely, today:

- `useUserSession.ts` puts `management` into `ADMIN_ROLES`, so `isAdmin=true`.
- `AdminRoute.tsx` lets the role into `/admin/*`.
- `useSku.ts` synthesises `sku='internal'` for any admin so they see all features in shared components.

That collapses two very different users into one surface. `super_admin` is ENCEPHLIAN engineering / operations — they need cross-clinic visibility, the model registry, edit-delta forensics. `management` is *the clinic operator* — typically a clinic owner, ops lead, or admin nurse at a single Indian neurology clinic. They want to know: "is the pipeline working for *my* clinic, are my clinicians using it, am I on track for monthly throughput, am I running out of credit?"

### Their day

- Morning: walk in, glance at the dashboard on the front-desk laptop or phone. *Are studies flowing? Anything failed overnight?*
- Mid-day: a clinician complains a report is taking too long. They check pipeline health and per-clinician utilization to triage.
- End of week: review weekly throughput vs. expectation; do they need to onboard a second clinician?
- Monthly: review credit burn (if pilot/wallet-billed), decide whether to top up.

### What they are accountable for

In order of priority for the dashboard:

1. **Throughput** — are studies actually flowing? (Their primary KPI vs. ENCEPHLIAN.)
2. **Pipeline reliability** — did the platform deliver, or did we silently fail? (The trust contract.)
3. **Signal quality** — are *their* technicians acquiring usable EEGs? (Action: training opportunity, not blame.)
4. **Clinician utilization** — are their neurologists actually engaging with the tool? (Adoption signal.)
5. **Cost / credit runway** — pilot only. Will they hit a wall mid-month?

### Explicit non-goals

- This is **NOT a clinician surface.** Triage queues, signal viewer, edit panels — none of those live here. Clinicians go to `/app/dashboard`.
- This is **NOT a super_admin surface.** No cross-clinic queries, no model promotion controls, no audit log access, no validation-run management.
- This is **NOT a sales surface.** No "upgrade your plan" CTA, no marketing copy. Operational truth only.
- **No patient identifiers in aggregate panels.** A management user sees "23 studies this week," not patient names. PHI lives one click deeper, behind the same RLS clinicians use.

---

## 2. Where it lives in the route tree

The simplest landing pattern keeps the existing `AdminRoute` guard:

| Role | URL | Renders |
|---|---|---|
| `super_admin` | `/admin` | `AdminDashboard` (existing — cross-clinic ops view) |
| `management` | `/admin` | `ManagementDashboard` (new — single-clinic ops view) |
| `clinician` | `/admin` | redirected to `/app/dashboard` (existing) |

This is a one-line branch inside `AdminLayout` (or a new `ManagementDashboard.tsx` route that `AdminRoute` mounts when `roles.includes('management') && !roles.includes('super_admin')`).

When the pilot/internal route split (`pilot_internal_split_design.md`) lands, management would still land at `/admin` — that doc doesn't reassign the `management` surface. The `/pilot` and `/internal` trees are clinician-facing.

Alternative considered + rejected: a dedicated `/management/*` tree. Rejected because it would require duplicating the `AdminTFAGate` and AdminLayout chrome for a single page; the role-aware branch inside the existing `AdminRoute` is lower-overhead.

---

## 3. Information architecture — the seven panels

Order on the page is the priority order from §1. On mobile, all panels collapse to a single column in this order — the highest-priority panel renders first above the fold.

### Panel A — Throughput

The headline. Three time windows + a sparkline trend.

| Element | Source query |
|---|---|
| Studies today | `count(studies) WHERE clinic_id = $self AND created_at::date = today` |
| Studies this week | `count(studies) WHERE clinic_id = $self AND created_at >= date_trunc('week', now())` |
| Studies this month | `count(studies) WHERE clinic_id = $self AND created_at >= date_trunc('month', now())` |
| 14-day sparkline | grouped daily count over the last 14 days |
| Breakdown by vendor format | `count(studies) GROUP BY original_format` (last 30 days) |
| Breakdown by clinician (owner) | `count(studies) GROUP BY owner` (last 30 days), joined to `profiles.full_name` |

**Empty state (pilot, week 1):** "5 studies so far this week. Sparkline appears after 7 days of data."
**Honest unknown:** if `original_format` is null for some rows, surface "12 of 23 studies — vendor format not yet recorded" rather than silently dropping them.

### Panel B — Pipeline health

The trust contract. Most important after throughput because it's where management catches us silently failing.

| Element | Source query |
|---|---|
| C-Plane / I-Plane / Read API uptime | `study_pipeline_events` rollup over last 24h — `count(status='error') / count(*)` per `source` (cplane / iplane / supabase_edge) |
| Mean processing time per study | `avg(triage_completed_at - triage_started_at)` over last 7 days where both timestamps non-null |
| Failure rate (7-day) | `count(studies WHERE state='failed') / count(studies)` |
| Failure breakdown | last 7 days, group `study_pipeline_events` rows where `status='error'` by `step` (vendor_parse, channel_resolve, esf_emit, iplane_invoke, etc.) |
| List of 5 most recent failures | study id + step + correlation_id + retry button (links to admin study detail) |

**Empty state (pilot, week 1):** "No failures recorded in the last 24h. Uptime baseline appears after 7 days of pipeline events."
**Honest unknown:** if a failure has no `study_pipeline_events` row (e.g. silent fetch failure pre-dating the failover-UX work), surface "1 study marked failed with no pipeline trace — please report" rather than rolling it into the same bucket.

Failure-bucket copy borrows from `failover_ux_design.md` §2 — no generic "an error occurred."

### Panel C — Signal quality

The most operationally useful panel for clinic action because the answer is always "train a technician."

| Element | Source query |
|---|---|
| % studies with poor channel quality (7-day) | studies where ≥3 channels are `quality_class IN ('bad','missing')` in `channel_quality_assessments` / total studies in window |
| Average % bad-channels per study | `avg(bad_channel_count / 19.0)` over completed studies in last 30 days |
| Trend (30-day, weekly bins) | weekly aggregate of the above |
| Top 5 most-frequently-bad channels | group `channel_quality_assessments` rows by `channel_label` where `quality_class='bad'` |

**Empty state:** "Channel quality data appears after the first study completes pipeline processing."
**Honest unknown:** if `channel_quality_assessments` rows for recent studies are empty *and* VIGIL is deprecated (it is, post-`20260531000000_deprecate_vigil_and_forge_v1.sql`), surface "Channel quality estimator under repair — see [model status](/admin/models). Per-channel quality is being computed by the deterministic rule fallback." This is **not** a degraded state to hide — it's the postmortem-honesty discipline applied to a live model gap.

### Panel D — Clinician utilization

Per-clinician, aggregated, no patient detail.

| Element | Source query |
|---|---|
| Studies per clinician (30-day) | `count(studies) GROUP BY owner` joined to `profiles.full_name` |
| Average time-to-sign per clinician | `avg(reports.signed_at - studies.triage_completed_at)` joined to clinician |
| Edit-delta rate per clinician | `count(clinician_edit_deltas WHERE edit_type IN ('edit','reject')) / count(*)` grouped by `clinician_id` |
| Most-edited field (per clinician) | top 1 `field_id` from `clinician_edit_deltas` where `edit_type='edit'` in last 30 days |

**Why edit-delta rate is here and not in pipeline health:** edit-delta rate is a clinician-platform-fit signal, not a pipeline signal. Per `edit_delta_retraining_design.md` §1, the right primary aggregation unit is `(model_family, finding_kind)` for *retraining* — but for *utilization*, `clinician_id` is the right axis: it tells management whether their clinicians are accepting model output or fighting it.

**Honest unknown:** when a clinic has < 3 clinicians, the rate is noisy; surface per-clinician absolute counts with a footer "rates need at least 20 studies per clinician to be meaningful." This is the same κ-style noise discipline §4 of the retraining doc applies.

**Privacy note:** clinicians-on-management's-clinic see their own row already at `/app/dashboard`. Showing per-clinician rates to the management user is appropriate — they manage these people. It is *not* shown to other clinicians.

### Panel E — Wallet / credit (pilot SKU only)

Per `useSku.ts`, management users are flagged `hasWallet=false` and the wallet nav entry is stripped. **But that's a per-user flag, not a per-clinic flag.** The clinic still has wallets — they belong to individual clinicians on it. The management user wants a roll-up view.

| Element | Source query |
|---|---|
| Total credits remaining (clinic-wide) | `sum(wallets.tokens) JOIN clinic_memberships ON wallets.user_id = cm.user_id WHERE cm.clinic_id = $self` |
| 30-day burn rate | `sum(wallet_transactions.amount WHERE operation IN ('debit','sla_charge') AND created_at > now() - interval '30 days')` joined via `user_id` to clinic |
| Projected runway (days) | `remaining / (burn_rate / 30)` |
| Top 5 token consumers (clinicians) | sum of debits grouped by user, last 30 days |

This panel **only renders for `sku='pilot'`**. Internal / prod clinics in this tier don't see it (they aren't wallet-billed today; if/when they are, this panel re-renders with a check on `clinics.billing_model`).

**Empty state:** "No wallet activity yet. Top up tokens to start triage."
**Honest unknown:** if burn rate is < 7 days of data, surface "Runway projection appears after 7 days of wallet activity" rather than extrapolating from 1–2 datapoints.

Aggregation requires a new RPC `clinic_wallet_summary(p_clinic_id uuid)` because RLS on `wallets` is currently user-scoped — clinicians see their own only. The RPC is `SECURITY DEFINER`, returns aggregates only, and gates on `has_role(auth.uid(), 'management')` AND the user being a member of the requested clinic. **It never returns per-clinician balance amounts** — only the top-5 consumers list (with names, since management already knows who their clinicians are) and total/burn.

### Panel F — Recent activity feed

Last ~10 events of consequence (not every pipeline event — pipeline events live in Panel B's failure list when red).

Events shown:
- Study failed (link to study)
- New clinician onboarded (membership added to this clinic)
- Clinic-owned validation row created for a model (rare, mostly P2)
- A model the clinic relies on was deprecated (sourced from `model_versions.deprecated_at` for models cited in this clinic's recent reports)
- Top-up event (wallet credited)

**Why model deprecation is in the activity feed:** the VIGIL postmortem (`postmortem_vigil_clean_v2.md`) makes clear that model deprecation is operationally relevant *to clinics*, not just to engineering. If their `mind_clean v2` was the source of recent biomarker findings, they should see "the model that produced findings in your last 14 reports was deprecated — those findings are now flagged as `derived_from=pending`."

**Empty state:** "No recent activity in the last 7 days. New studies, top-ups, and platform changes will appear here."

### Panel G — "What we don't know yet" footer

The honesty primacy panel. Every dashboard load renders this section explicitly listing data gaps. Examples it might enumerate:

- "Per-channel quality estimator (VIGIL) is currently a deterministic rule fallback — see [model status](/admin/models)."
- "Triage v3 has been validated; ARIA / VERTEX heads are planned but not yet serving — see [models page](/admin/models)."
- "Edit-delta rate per finding-kind is not yet broken out — first iteration aggregates across all findings."
- "Cross-clinic benchmark not yet available (P2)."

**Why this panel always renders:** per postmortem §"systemic root cause," the structural failure mode is *silently presenting an estimate as a measurement.* This panel inverts that: it explicitly says what we are *not* showing and why. It is the dashboard's audit-trail-of-itself. Copy is editable by `super_admin` via a `dashboard_honest_gaps` table (P1) — but ships with a hardcoded default copy bundle in P0 so it can never be empty.

---

## 4. Density + chrome per SKU

The dashboard is **the same component tree** across SKUs — the difference is layout density, panel visibility, and copy. We do NOT branch on SKU at panel level; we branch on SKU at layout level via a `<SkuLayout>` wrapper.

| Layout aspect | `pilot` | `prod` | `internal` |
|---|---|---|---|
| Columns at desktop | 1 wide column | 2 columns | 3 columns |
| Sparkline length | 14 days | 30 days | 90 days |
| Recent activity items | 5 | 10 | 20 |
| Failure breakdown depth | top 3 steps | top 5 steps | full breakdown |
| Wallet panel | shown | hidden (unless `billing_model='wallet'`) | hidden |
| "Still gathering data" empty-state copy | full sentence ("5 studies so far — sparkline appears after 7 days") | shorter ("5 / sparkline pending") | terse ("n=5, pending bin") |
| Page header | "Operations — [Clinic Name]" | same | same + "(internal)" badge |

The SKU-density discipline matches `aesthetic_encephlian.md` and the pilot dashboard precedent (`PilotDashboard.tsx` is single-column, low-density, full-sentence copy).

---

## 5. Permissions + data scope

### RLS — what the management user can read

The `management` role today appears in many existing RLS policies as a co-equal of `super_admin` (e.g., the model_versions policies, channel_quality_assessments admin write policy). We are *not* removing those super-admin-equivalent grants — they remain valid for global writes management may need (e.g., resetting a clinic-level config).

What we are adding is a *clinic scoping check* in the **dashboard's RPC layer**, not in RLS:

| Table | Existing RLS for management | Dashboard scoping |
|---|---|---|
| `studies` | Reads everything (super_admin-equivalent) | RPC filters `WHERE clinic_id = my_clinic()` |
| `study_pipeline_events` | Reads all | Same — joined to studies |
| `channel_quality_assessments` | Reads all | Same — joined to studies |
| `clinician_edit_deltas` | Read policy includes management role | Same — joined to studies |
| `wallets` | RLS denies management (user-scoped only) | New `SECURITY DEFINER` RPC required — see §3 Panel E |
| `model_versions` | Reads all | Read all — but only render rows whose `id` appears in this clinic's recent `report_emission_events.model_version_id` |
| `model_validation_runs` | Reads all | Same |

**Why scope in the RPC, not RLS:** super_admin and management share RLS policies today. Splitting them by clinic in RLS would require encoding "the management user's clinic_id" in a policy predicate, which means a `current_setting()` or a per-user lookup on every query. Cleaner to keep RLS as-is and have the dashboard RPCs do the filtering. The trade-off: a bug in the RPC could leak cross-clinic data. Mitigation: every RPC has a unit test asserting cross-clinic data is filtered out, and the RPC is `SECURITY INVOKER` so it cannot widen RLS.

### Helper: `my_clinic()` SQL function

```sql
CREATE OR REPLACE FUNCTION public.management_user_clinic_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT clinic_id
    FROM public.clinic_memberships
   WHERE user_id = p_user_id
   LIMIT 1;
$$;
```

If a management user is a member of >1 clinic (rare but possible), the dashboard adds a clinic-switcher in the header (existing `useClinicSelector` hook). Default: most recently active clinic. This RPC takes `p_user_id` and returns one clinic at a time — the switcher passes the selected id explicitly to every dashboard RPC, never relying on a magic `auth.uid()` resolution server-side.

### Aggregated cross-clinic comparison (P2)

A separate RPC `clinic_benchmark_compare(p_clinic_id uuid, p_metric text)` returns:
- the calling clinic's value for the metric
- the same-tier average (median + p25/p75)
- a sample size (n)

It returns aggregates only — never per-clinic names or ids. Same-tier defined by `clinics.sku` AND `clinics.region` (so we don't compare a 50-study/day Bombay clinic to a 5-study/week Madurai one). Refuses to return any bucket with n < 5 (de-anonymization risk).

---

## 6. Data model + queries

### What already exists (no schema changes needed for P0)

- `studies` — has `clinic_id`, `owner`, `state`, `created_at`, `original_format`, `triage_status`, `triage_started_at`, `triage_completed_at`, `tokens_deducted`. All we need for throughput + pipeline health.
- `study_pipeline_events` — append-only, source IN (`supabase_edge`, `cplane`, `iplane`, `admin_ui`), status IN (`ok`, `error`, `skipped`, `info`). Already indexed `(study_id, created_at DESC)`. Sufficient.
- `channel_quality_assessments` — has `study_id`, `channel_label`, `quality_class`. Has `channel_quality_bad_idx`. Sufficient.
- `clinician_edit_deltas` — has `study_id`, `clinician_id`, `field_id`, `edit_type`. Append-only. Indexed by clinician + study. Sufficient.
- `model_versions`, `model_validation_runs` — sufficient.
- `wallets`, `wallet_transactions` — sufficient with the new aggregate RPC from §3 Panel E.
- `clinic_memberships` — sufficient.

### What needs to be added

**P0:** nothing. All P0 panels query existing tables via new RPCs.

**P1 / P2 (optional):**

- A daily aggregate table `clinic_daily_ops_snapshot` (clinic_id, snapshot_date, studies_count, failed_count, avg_processing_seconds, …). Backfill nightly via Supabase cron. Speeds up the 30/90-day sparkline queries by 10–100x. Defer to P2 — measure first, optimize when load demands it.
- A `dashboard_honest_gaps` table for editable empty-state copy (Panel G) — P1.

### Latency budget

Target: dashboard mount → all panels visible in **< 800ms total** on cold cache, **< 200ms** on warm cache.

| Panel | Estimated cold-query time | Mitigation |
|---|---|---|
| Throughput | 100–200 ms (date-truncated count) | indexed on `(clinic_id, created_at)` — already exists |
| Pipeline health | 200–400 ms (24h rollup of pipeline events) | new index `(source, status, created_at)` may help; measure first |
| Signal quality | 100–300 ms | uses existing `channel_quality_bad_idx` |
| Clinician utilization | 200–400 ms (group-by + join to profiles) | may need a `clinic_clinician_utilization_30d` materialized view at P2 |
| Wallet | 50–100 ms (sum on small wallets table) | trivial |
| Activity feed | 50–100 ms | trivial |

If P0 measurements exceed 800ms, P1 introduces the daily-snapshot aggregate table. Don't optimize before measuring.

### One example query: signal quality "% studies with poor channels"

```sql
SELECT
  count(DISTINCT study_id) FILTER (
    WHERE bad_channels >= 3
  )::float
  /
  NULLIF(count(DISTINCT study_id), 0) AS pct_poor_quality
FROM (
  SELECT
    cqa.study_id,
    count(*) FILTER (WHERE cqa.quality_class IN ('bad', 'missing')) AS bad_channels
  FROM public.channel_quality_assessments cqa
  JOIN public.studies s ON s.id = cqa.study_id
  WHERE s.clinic_id = $1
    AND s.created_at >= now() - interval '7 days'
  GROUP BY cqa.study_id
) per_study;
```

Wrap in `SECURITY INVOKER` RPC `clinic_signal_quality_summary(p_clinic_id uuid, p_window_days int)`.

---

## 7. Surfaced model claims — validation-gate hygiene

The dashboard MUST NOT hardcode any model metric. This is the postmortem-vigil-clean lesson applied prospectively. The exact rule:

- Any rendered AUC, accuracy, F1, calibration ECE, or "verdict" string reads from `model_validation_runs` via a `model_version_id` foreign key — never from a TypeScript constant.
- Any "currently-serving" model name renders from `model_versions WHERE status='serving'`. The `enforce_model_validation_for_serving` trigger (live since 2026-06-02) guarantees a validation row exists.
- A model that has no `model_validation_runs` row with `verdict IN ('functional','excellent')` renders as **"validation pending"** in the activity feed — not as a name + version with no asterisk.

Concretely, the model-mention surface on the dashboard is small (Panel F activity feed, and Panel G honesty footer). Implementation pattern (mirrors `AdminValidationRuns.tsx`):

```ts
const servingModelsForThisClinic = useQuery({
  queryKey: ['clinic-serving-models', clinicId],
  queryFn: () => supabase.rpc('clinic_serving_models', { p_clinic_id: clinicId }),
});

// RPC body:
// SELECT mv.*, latest_mvr.verdict
//   FROM model_versions mv
//   LEFT JOIN LATERAL (
//     SELECT verdict FROM model_validation_runs
//      WHERE model_version_id = mv.id
//      ORDER BY run_at DESC LIMIT 1
//   ) latest_mvr ON true
//  WHERE mv.id IN (
//    SELECT DISTINCT model_version_id
//      FROM report_emission_events ree
//      JOIN studies s ON s.id = ree.study_id
//     WHERE s.clinic_id = p_clinic_id
//       AND ree.emitted_at > now() - interval '30 days'
//  )
```

Verdict color: `excellent` → green, `functional` → blue, `middling` → amber, `broken` / null → red.

---

## 8. Real-time vs polling vs snapshot

**Recommendation: polling, with a single targeted realtime subscription.**

| Approach | Pros | Cons | Verdict |
|---|---|---|---|
| Pure polling (every 30s via TanStack `refetchInterval`) | Simple, debuggable, scales linearly, matches `AdminDashboard.tsx`'s existing pattern | 30s latency on failure detection | **Default** |
| Realtime on every panel | Sub-second updates | 7 channels per dashboard load × N concurrent management users = high Supabase ws cost | Reject |
| Realtime on `studies` table only | Sub-second on the highest-value signal (study failed, study completed) | One channel per dashboard, debounced to a single `refetchStudies` | **Add for the throughput + pipeline panels** |
| Last-snapshot-as-of timestamp (no auto-refresh, manual reload) | Cheapest | Bad UX — management goes 4h without a refresh and thinks the system is healthy when it isn't | Reject |

The dashboard renders a small "Updated 12s ago" footer driven by `useQuery.dataUpdatedAt`. When the realtime subscription fires for `studies` changes, debounced invalidation flips the marker to "Updating…" then back to "Updated 0s ago." This is `useDashboardData.ts`'s existing pattern — extend, don't replace.

---

## 9. Mobile / responsive

Pilot clinic management *will* check on phone. A small clinic doesn't have a dedicated ops workstation; the owner uses their phone in the waiting room between patients.

| Breakpoint | Layout |
|---|---|
| < 640 px (mobile) | Single column, all panels stacked. Throughput first, pipeline health second, the rest collapsed into accordions. Wallet panel: just "**X** credits / **Y** days runway" — full table behind a "View detail" link. |
| 640–1024 px (tablet) | Two-column grid for the smaller panels (signal quality, clinician utilization, wallet); throughput + pipeline health remain full-width at the top. |
| > 1024 px (desktop) | Density depends on SKU per §4. |

Sparklines render on all breakpoints (they are small SVGs; cost is negligible). Data tables (top consumers, top failed steps) collapse to "Top 3" on mobile, "Top 5" on tablet, "Top 10" on desktop.

What gets dropped on mobile: the "What we don't know yet" panel (Panel G) becomes a single collapsed accordion `Show data gaps (3)`. It must remain reachable — never just hidden — because the honesty contract requires it.

---

## 10. Implementation phases

### P0 — ship before pilot scale-up (~1 week effort)

The minimum bar to put a `management` user in front of the dashboard without lying to them.

- New route + role-branch in `AdminRoute` / `AdminLayout`.
- `ManagementDashboard.tsx` page component.
- Panels A (throughput), B (pipeline health), C (signal quality), G (honest gaps).
- Three new RPCs: `clinic_throughput_summary`, `clinic_pipeline_health_summary`, `clinic_signal_quality_summary`.
- Existing tests + new RLS unit tests asserting no cross-clinic leakage.

### P1 — first month of pilot (~1 week)

Add what becomes useful once data has accumulated.

- Panel D (clinician utilization) — depends on having ≥ 2 weeks of data per clinician.
- Panel E (wallet, pilot SKU only) — depends on `clinic_wallet_summary` RPC.
- Panel F (recent activity feed) — depends on having a few events to display.
- `dashboard_honest_gaps` table + admin UI for super_admin to edit copy.
- Mobile responsive polish (the P0 ships with a single-column fallback; P1 tunes spacing).

### P2 — later (~1–2 weeks)

Speed + cross-clinic benchmarking. Defer until P0/P1 measurements demand it.

- Daily aggregate table `clinic_daily_ops_snapshot` + nightly cron.
- Cross-clinic benchmark RPC `clinic_benchmark_compare`.
- Per-clinician utilization materialized view (if Panel D is slow).
- Daily/weekly email digest for the management user (opt-in).

---

## 11. Critical files for implementation

The four-file backbone for P0:

- `/Users/h/encephlian/src/pages/admin/ManagementDashboard.tsx` — **new**. The top-level page that branches by role within the existing `AdminRoute`.
- `/Users/h/encephlian/src/components/admin/AdminRoute.tsx` — **edit**. Add the role-aware branch: when `roles.includes('management') && !roles.includes('super_admin')`, the `/admin` index renders `ManagementDashboard` instead of `AdminDashboard`.
- `/Users/h/encephlian/src/hooks/useManagementDashboardData.ts` — **new**. Encapsulates the seven panel queries, calls the new RPCs, and exposes one cached object per panel. Mirrors the `useDashboardData.ts` shape.
- `/Users/h/encephlian/supabase/migrations/<timestamp>_management_dashboard_rpcs.sql` — **new**. Adds the three P0 RPCs (`clinic_throughput_summary`, `clinic_pipeline_health_summary`, `clinic_signal_quality_summary`), the `management_user_clinic_id` helper, and the RLS unit tests in DO blocks.

Plus, six smaller component files (one per panel):

- `/Users/h/encephlian/src/components/management/ThroughputPanel.tsx`
- `/Users/h/encephlian/src/components/management/PipelineHealthPanel.tsx`
- `/Users/h/encephlian/src/components/management/SignalQualityPanel.tsx`
- `/Users/h/encephlian/src/components/management/ClinicianUtilizationPanel.tsx` (P1)
- `/Users/h/encephlian/src/components/management/WalletSummaryPanel.tsx` (P1)
- `/Users/h/encephlian/src/components/management/RecentActivityPanel.tsx` (P1)
- `/Users/h/encephlian/src/components/management/HonestGapsFooter.tsx` (P0)

Existing patterns to copy from rather than reinvent:

- `/Users/h/encephlian/src/pages/admin/AdminDashboard.tsx` — the layout chrome, KPI tile grid, recent-activity styling. The new ManagementDashboard inherits the visual rhythm.
- `/Users/h/encephlian/src/components/dashboard/PilotDashboard.tsx` — the low-density single-column-with-prose copy idiom for pilot SKU.
- `/Users/h/encephlian/src/pages/admin/AdminEditDeltas.tsx` — the table-of-deltas pattern for the clinician-utilization edit-delta column.

---

## 12. Open questions for the user

Numbered for explicit answers. Implementation cannot proceed past P0 until at least 1–5 are answered.

1. **What does "satisfaction" mean for a management user?** Is the dashboard's primary success metric (a) "I knew about every failure before a clinician complained," or (b) "I trust the throughput number enough to plan staffing?" These point at different panel priorities.

2. **Do management users get a daily/weekly email digest, or do we trust them to log in?** The activity feed (Panel F) is fine for engaged users, but a digest catches the "I haven't logged in in 3 days, did anything fail?" case. P1 if yes, P2 otherwise.

3. **Billing escalation logic.** If a clinic's wallet runway < 5 days, do we (a) just show amber on the dashboard, (b) email the management user, (c) email + Slack ENCEPHLIAN ops, (d) hard-block new SLA selections? Current code does none of these.

4. **Multi-clinic management users.** Today 0 management users are on >1 clinic, but the schema allows it. Do we plan to assign one ops lead to multiple pilot clinics (in which case the clinic switcher matters), or is one-management-per-clinic the steady-state assumption?

5. **Honest-gaps copy ownership.** Who owns the empty-state copy (Panel G)? Engineering writes the defaults, but a clinical lead or you needs to sign off on the tone for the pilot clinics. Same lane as `failover_ux_design.md` open question 5.

6. **Cross-clinic benchmark visibility (P2).** Are management users *expected* to see "you're in the 60th percentile for throughput," or is that data we keep internal and surface only to super_admin? Affects whether P2 ships at all.

7. **Audit-log access for management.** Today `/admin/audit` is reachable by management (per the existing `AdminRoute` policy). The new dashboard doesn't surface audit data — should we lock down `/admin/audit` to super_admin, or leave it as-is?

8. **PHI sensitivity in the activity feed.** "Study failed (ID 7c4f-…)" is fine. "Study failed for patient Rajesh K, 42" is not. The current `studies.meta` blob contains patient info. Confirm the activity feed renders only the truncated study id + no `meta` fields.

9. **Per-clinician edit-delta rate display.** Showing a clinician "Dr. X has a 23% reject rate" to their management lead is a labor-relations question, not just a UX one. Do we show this raw, hide it behind a "Show details" toggle, or aggregate it across clinicians to spare individual blame?

10. **Per-vendor failure breakdown.** Panel B's failure breakdown groups by pipeline step. A useful overlay is "of the 5 vendor parse failures, 4 were Natus .e files." Worth adding as a sub-breakdown in P1?
