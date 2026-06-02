# Pilot/Internal Page-Level Split — Design

**Author:** Claude Opus 4.7 (Agent #52, 2026-06-02)
**Status:** Design only. No code changes implemented. User approval required before any phase ships.
**Sources:** Direct inspection of the encephlian frontend tree + Agent #33's UX audit findings (in conversation history).

---

## TL;DR

- **Two products in one URL tree** today — 12 `isPilot` branches in `StudyUploadWizard.tsx`, 7 in `StudyDetail.tsx`, plus inline page-level swaps in `Studies.tsx`/`Dashboard.tsx`/`Wallet.tsx`/`NotificationBell.tsx`. SKU divergence has outgrown conditional rendering.
- **Target tree:** `/pilot/*` for pilot clinics, `/internal/*` for internal ops, shared primitives in `src/components/` (no audience mixing in shared code).
- **Route-level auth gate** replaces in-component conditionals: `useSku()` decides which sub-tree mounts before any leaf component runs. Removes ~30 `if (isPilot)` branches from leaves.
- **Per-file migration plan** in §3 (shared vs pilot-owned vs internal-owned); **6-phase migration sequence** in §6 ordered for low blast radius.
- **7 ranked risks** in §7 (admin SKU synthesis, deep links, RLS, training links, etc.) with mitigations; **5 open product questions** in §8 must be answered before phase 5 ships.

---

## 0. Audit anchor (rebuilt from inspection)

Confirmed pain. Twelve `isPilot` branches in `StudyUploadWizard.tsx` (1385 LOC), seven in `StudyDetail.tsx` (1435 LOC), inline `if (isPilot) return <PilotStudiesView/>` swaps in `Studies.tsx` and `Dashboard.tsx`, more in `Wallet.tsx`, `NotificationBell.tsx`, `SlaSelectionModal.tsx`, `StudyFlowProgress.tsx`, `SkuBadge.tsx`. `Lanes.tsx` is internal-only de facto (nav gate hides it for pilot) but lives at `/app/lanes`. Two products are sharing one URL tree.

Source of truth for "is this clinic on pilot?" is `clinics.sku ∈ {'internal','pilot','prod'}`, surfaced via `user_clinic_context.sku` → `useUserSession().clinicContext.sku` → `useSku().isPilot`. There is no `clinics.is_pilot` boolean. Admins inherit `sku='internal'` synthetically (see `useSku.ts:55`).

---

## 1. Target route structure

```
/                        Login (unchanged)
/login                   Login
/reset-password          ResetPassword
/legal/*                 Public legal pages (Terms, Privacy, Refund, Support)
                         — already a separate tree, untouched

/admin/*                 Super-admin + management (unchanged tree)
                         AdminRoute guard: isAdmin

/pilot/*                 NEW. Clinicians on clinics.sku='pilot'
                         PilotRoute guard: isAuthenticated && !isAdmin && sku==='pilot'
  /pilot                 → redirect to /pilot/studies
  /pilot/studies         PilotStudies (list, "value-first" UI)
  /pilot/studies/:id     PilotStudyDetail (overview + analysis tab only)
  /pilot/studies/:id/viewer  PilotSignalViewer (proxy mode, no overlays)
  /pilot/wallet          PilotWallet (token packs only, no ledger)
  /pilot/profile         Profile (SHARED)
  /pilot/settings        Settings (SHARED)
  /pilot/settings/tfa    TFASetup (SHARED)
  /pilot/onboarding      PilotOnboarding (existing component)
  /pilot/docs            Documentation (SHARED, pilot-flavored slice)

/internal/*              NEW. Clinicians on clinics.sku='internal' (dev/ops)
                         InternalRoute guard: isAuthenticated && !isAdmin && sku==='internal'
  /internal              → redirect to /internal/dashboard
  /internal/dashboard    InternalDashboard (full KPIs, urgent queue, refunds)
  /internal/studies      InternalStudies (full table, all filters, debug source line)
  /internal/studies/:id          InternalStudyDetail (overview + report + analysis + files + pipeline trace)
  /internal/studies/:id/review   StudyReview (SHARED)
  /internal/studies/:id/viewer   SignalViewer (full mode, artifacts overlay)
  /internal/lanes        Lanes (kanban — internal-only feature)
  /internal/reports      Reports
  /internal/reports/:id  ReportDetail
  /internal/viewer       SignalViewer (orphan-blob viewer)
  /internal/notes        Notes
  /internal/files        Files
  /internal/wallet       InternalWallet (full ledger + all token packs)
  /internal/support      Support
  /internal/docs         Documentation
  /internal/report-v0    AdminReportV0 (internal-only experimental)
  /internal/profile,settings,settings/tfa,onboarding-guide  SHARED

/app/*                   LEGACY — redirect layer for 6–12 months.
                         Reads sku, 301-equivalent to /pilot/* or /internal/*
                         preserving path tail (studies/:id, viewer query, etc.)
```

`prod` SKU (in DB enum but absent from `SkuTier`) is treated as `pilot` at this stage — see open question Q4.

---

## 2. Component partition

### SHARED — primitives, pure data hooks, pure logic (no audience mixing)

| Path | What |
|---|---|
| `src/components/ui/*` | shadcn primitives — already shared. |
| `src/components/AppLayout.tsx` → split see §3 | Becomes `src/components/shared/AppShell.tsx` (header, footer, theme, command palette) + `src/components/pilot/PilotSidebar.tsx` + `src/components/internal/InternalSidebar.tsx`. |
| `src/components/Breadcrumbs.tsx` | Pure, shared. |
| `src/components/ProtectedRoute.tsx` | Shared base. Gets two siblings: `PilotRoute.tsx`, `InternalRoute.tsx`. |
| `src/components/ThemeToggle.tsx`, `CommandPalette.tsx`, `LiveAlertBanner.tsx`, `GeoRestrictionModal.tsx`, `QuickTipsDialog.tsx`, `ErrorPage.tsx`, `PDFViewer.tsx`, `FilePreviewDialog.tsx`, `EditableBranding.tsx`, `CalendarWidget.tsx` | Pure UI. Shared. |
| `src/components/study/PatientMetaEditor.tsx` | Pure form. Shared. |
| `src/components/viewer/*` | Signal viewer primitives. Shared (gated via props from caller). |
| `src/components/report/*` | Report primitives + PDF. Shared (signed report is identical across audiences). |
| `src/components/sku/SkuGate.tsx`, `TokenPurchase.tsx` | Shared utilities. |
| `src/contexts/*` | All three. Shared. |
| `src/hooks/use-mobile.tsx`, `use-toast.ts`, `useNotifications.ts`, `useClinicSelector.ts`, `useSku.ts`, `useStudiesData.ts`, `useDashboardData.ts`, `useFilesData.ts`, `usePilotData.ts` | All hooks are pure data. Shared. `useSku()` stays — used by the routing decision and a few cross-cutting UI elements (SkuBadge). |
| `src/shared/*`, `src/lib/*`, `src/integrations/*` | Shared. |
| `src/pages/app/Profile.tsx`, `Settings.tsx`, `TFASetup.tsx`, `Notes.tsx`, `Files.tsx`, `Support.tsx`, `Documentation.tsx`, `OnboardingGuide.tsx` | Move to `src/pages/shared/` and import from both trees. They have no `isPilot` branches today — verified by grep. |
| `src/pages/app/StudyReview.tsx`, `Reports.tsx`, `ReportDetail.tsx`, `SignalViewer.tsx` | No `isPilot` branches. Move to `src/pages/shared/` and mount from internal tree (pilot doesn't need them today). |

### PILOT-OWNED — `src/pages/pilot/*` and `src/components/pilot/*`

| Path | Origin |
|---|---|
| `src/pages/pilot/PilotStudies.tsx` | Promote from `src/components/pilot/PilotStudiesView.tsx`. |
| `src/pages/pilot/PilotStudyDetail.tsx` | Extract `isPilot` branches from `src/pages/app/StudyDetail.tsx`. |
| `src/pages/pilot/PilotDashboard.tsx` | Promote from `src/components/dashboard/PilotDashboard.tsx`. |
| `src/pages/pilot/PilotWallet.tsx` | Extract `isPilot` branch from `src/pages/app/Wallet.tsx`. |
| `src/pages/pilot/PilotOnboarding.tsx` | Promote from `src/components/pilot/PilotOnboarding.tsx`. |
| `src/components/pilot/PilotInlineSla.tsx` | Stays. |
| `src/components/pilot/PilotUploadDialog.tsx` | NEW — extracted pilot half of `StudyUploadWizard.tsx` (steps 1–2, no SLA step). |
| `src/components/pilot/PilotStudyFlowProgress.tsx` | Extract pilot branch from `src/components/study/StudyFlowProgress.tsx`. |
| `src/components/pilot/PilotSlaModal.tsx` | Extract pilot branch from `src/components/dashboard/SlaSelectionModal.tsx`. |
| `src/components/pilot/PilotNotificationFilter.tsx` | Extract pilot tab default ("report") from `NotificationBell.tsx`. |
| `src/components/pilot/PilotSkuBadge.tsx` | Optional — pilot uses simpler badge (no toggling). |
| `src/components/pilot/PilotSidebar.tsx` | Three nav items only. |
| `src/components/pilot/PilotWalletCard.tsx`, `SampleReportPreview.tsx` | Already pilot-only — stay. |

### INTERNAL-OWNED — `src/pages/internal/*` and `src/components/internal/*`

| Path | Origin |
|---|---|
| `src/pages/internal/InternalStudies.tsx` | Extract `InternalStudiesView` from `src/pages/app/Studies.tsx`. |
| `src/pages/internal/InternalStudyDetail.tsx` | Extract internal branches from `src/pages/app/StudyDetail.tsx` (keeps full pipeline trace, files tab, report tab gated by `canGenerateReport`). |
| `src/pages/internal/InternalDashboard.tsx` | Extract internal branch from `src/pages/app/Dashboard.tsx`. |
| `src/pages/internal/InternalWallet.tsx` | Extract internal branch from `src/pages/app/Wallet.tsx` (full ledger). |
| `src/pages/internal/InternalLanes.tsx` | Verbatim move of `src/pages/app/Lanes.tsx` (no branches to strip; it was already an internal-only feature). |
| `src/components/internal/InternalUploadDialog.tsx` | NEW — extracted internal half of `StudyUploadWizard.tsx` (3-step wizard with SLA selection). |
| `src/components/internal/InternalStudyFlowProgress.tsx` | Extract internal branch from `StudyFlowProgress.tsx`. |
| `src/components/internal/InternalSlaModal.tsx` | Extract internal branch from `SlaSelectionModal.tsx`. |
| `src/components/internal/InternalSidebar.tsx` | Full nav. |

---

## 3. Per-file migration plan

| Existing file | Action | Destination |
|---|---|---|
| `src/components/upload/StudyUploadWizard.tsx` (1385 L, 12 branches) | **SPLIT** | Pure split. Header extractor helpers (`extractEDFHeader`, `detectBundles`, `BUNDLE_VENDOR_LABEL`, `parseEDFMeta`, `uploadOneFile`, `uploadBundle`) → `src/components/upload/uploadCore.ts` (SHARED). Pilot 2-step wizard → `src/components/pilot/PilotUploadDialog.tsx`. Internal 3-step wizard → `src/components/internal/InternalUploadDialog.tsx`. Delete original. |
| `src/pages/app/StudyDetail.tsx` (1435 L, 7 branches) | **SPLIT** | Extract pure data hooks (`useStudyDetail`, `useStudyRealtime`, `useMindReport`, `useStudyTitleSync`) → `src/hooks/useStudyDetail.ts` (SHARED). `SignReportSurface` (shared logic, uses `isPilot` only for next-link target — receive as prop) → `src/components/study/SignReportSurface.tsx`. Pilot screen (gateTriageActions UI, inline SLA, overview + analysis tabs only) → `src/pages/pilot/PilotStudyDetail.tsx`. Internal screen (overview + report + analysis + files, pipeline trace details, header debug strings) → `src/pages/internal/InternalStudyDetail.tsx`. |
| `src/pages/app/Studies.tsx` (515 L) | **SPLIT** | `InternalStudiesView` (the bottom 300 L) → `src/pages/internal/InternalStudies.tsx`. Top `Studies()` dispatcher deleted. `PilotStudiesView` promoted to `src/pages/pilot/PilotStudies.tsx`. Shared `StudyRow` row component → `src/components/study/StudyListRow.tsx`. |
| `src/pages/app/Dashboard.tsx` (354 L) | **SPLIT** | Top dispatch deleted. Internal body → `src/pages/internal/InternalDashboard.tsx`. `PilotDashboard.tsx` (component, 692 L) promoted to `src/pages/pilot/PilotDashboard.tsx`. |
| `src/pages/app/Wallet.tsx` | **SPLIT** | Admin "no wallet" branch lives nowhere routable (admins use `/admin`, not `/app`). Pilot body → `src/pages/pilot/PilotWallet.tsx`. Internal ledger body → `src/pages/internal/InternalWallet.tsx`. |
| `src/pages/app/Lanes.tsx` | **MOVE** | Verbatim → `src/pages/internal/InternalLanes.tsx`. No branches to strip. Pilot doesn't get a Lanes route. |
| `src/components/study/StudyFlowProgress.tsx` | **SPLIT** | Two-step pilot status renderer → `src/components/pilot/PilotStudyFlowProgress.tsx`. Multi-step pipeline renderer → `src/components/internal/InternalStudyFlowProgress.tsx`. `STEPS` constants live with each. |
| `src/components/dashboard/SlaSelectionModal.tsx` | **SPLIT** | Internal modal (Standard/Priority radio) → `src/components/internal/InternalSlaModal.tsx`. Pilot modal (token check + start) → `src/components/pilot/PilotSlaModal.tsx`. Delete `isPilot` prop entirely; each consumer imports its own. |
| `src/components/sku/SkuBadge.tsx` | **STAYS, simplified** | The badge is informational about the user's own tier — stays shared. Drop the `isInternal` branch (a pilot-tree consumer can never be internal and vice-versa); however, since admins viewing the pilot tree are impossible (admins go to `/admin`), this becomes essentially decorative. Consider deleting and inlining a constant per tree. |
| `src/components/NotificationBell.tsx` | **STAYS, refactor** | The one branch (`tab` default = "report" for pilot, "all" for internal) becomes a prop: `defaultTab`. Each shell passes its own value. Component itself is shared. |
| `src/hooks/useSku.ts` | **STAYS** | Used by the router decision and by `SkuBadge`. Inside pilot pages, calls to `isPilot` become tautological — delete those reads. Component-level usage drops to near zero. |
| `src/components/AppLayout.tsx` | **SPLIT** | `AppShell` (header bar, account dropdown, command palette, theme toggle, mobile sheet) → `src/components/shared/AppShell.tsx`. `PilotLayout` (uses AppShell + `PilotSidebar`) → `src/components/pilot/PilotLayout.tsx`. `InternalLayout` (uses AppShell + `InternalSidebar`) → `src/components/internal/InternalLayout.tsx`. `mainNavigation`/`resourceNavigation`/`accountNavigation` constants split between sidebars. |
| `src/components/ProtectedRoute.tsx` | **REPLACED** | Two new guards. `PilotRoute.tsx`: requires `!isAdmin && sku==='pilot'`; else redirects to `/internal` (if internal clinician) or `/login`. `InternalRoute.tsx`: requires `!isAdmin && sku==='internal'`; else redirects to `/pilot`. |
| `src/components/dashboard/PilotDashboard.tsx` | **MOVE** | → `src/pages/pilot/PilotDashboard.tsx`. |
| `src/components/pilot/PilotStudiesView.tsx` | **MOVE** | → `src/pages/pilot/PilotStudies.tsx`. |
| `src/pages/app/{Profile,Settings,TFASetup,Notes,Files,Support,Documentation,OnboardingGuide,StudyReview,Reports,ReportDetail,SignalViewer}.tsx` | **MOVE** | → `src/pages/shared/`. Routed from both trees (or internal only — see Open Q1). |
| `src/pages/Login.tsx` | **EDIT** | Destination logic changes: `isAdmin → /admin`, else read `sku` from session → `/pilot` or `/internal`. |
| `src/App.tsx` | **REWRITE** | See §4. |

---

## 4. Routing strategy (App.tsx)

```tsx
<Routes>
  <Route path="/" element={<Login/>}/>
  <Route path="/login" element={<Login/>}/>
  <Route path="/reset-password" element={<ResetPassword/>}/>
  <Route path="/legal/*" element={<LegalLayout/>}>…</Route>

  <Route element={<AdminRoute/>}>
    <Route path="/admin" element={<AdminLayout/>}>…</Route>
  </Route>

  <Route element={<PilotRoute/>}>
    <Route path="/pilot" element={<PilotLayout/>}>
      <Route index element={<Navigate to="/pilot/studies" replace/>}/>
      <Route path="studies" element={<PilotStudies/>}/>
      <Route path="studies/:id" element={<PilotStudyDetail/>}/>
      <Route path="studies/:id/viewer" element={<SignalViewer mode="proxy"/>}/>
      <Route path="wallet" element={<PilotWallet/>}/>
      <Route path="onboarding" element={<PilotOnboarding/>}/>
      … (profile/settings/docs from shared/)
    </Route>
  </Route>

  <Route element={<InternalRoute/>}>
    <Route path="/internal" element={<InternalLayout/>}>
      <Route index element={<Navigate to="/internal/dashboard" replace/>}/>
      <Route path="dashboard" element={<InternalDashboard/>}/>
      <Route path="studies" element={<InternalStudies/>}/>
      <Route path="studies/:id" element={<InternalStudyDetail/>}/>
      <Route path="studies/:id/review" element={<StudyReview/>}/>
      <Route path="studies/:id/viewer" element={<SignalViewer mode="full"/>}/>
      <Route path="lanes" element={<InternalLanes/>}/>
      <Route path="reports" element={<Reports/>}/>
      <Route path="reports/:id" element={<ReportDetail/>}/>
      <Route path="viewer" element={<SignalViewer/>}/>
      <Route path="notes" element={<Notes/>}/>
      <Route path="files" element={<Files/>}/>
      <Route path="wallet" element={<InternalWallet/>}/>
      <Route path="support" element={<Support/>}/>
      <Route path="docs" element={<Documentation/>}/>
      … (profile/settings/onboarding-guide from shared/)
    </Route>
  </Route>

  <Route path="/app/*" element={<LegacyAppRedirect/>}/>
  <Route path="*" element={<NotFound/>}/>
</Routes>
```

`LegacyAppRedirect` reads `sku` from session and redirects e.g. `/app/studies/abc → /pilot/studies/abc` (or `/internal/...`), preserving search and hash. Leave this in for at least 6 months — clinicians have email links to `/app/studies/:id`.

`PilotRoute` for a logged-in internal clinician hitting `/pilot/wallet` → redirect to `/internal/wallet` (the internal-tree equivalent). The guards never strand a clinician — they always reroute to the user's correct tree.

Sign-in landing (in `Login.tsx`):
- `isAdmin` → `/admin`
- `!isAdmin && sku==='pilot'` → `/pilot/studies`
- `!isAdmin && sku==='internal'` → `/internal/dashboard`
- unknown sku → fall back to `/pilot/studies` (same default as `useSku.ts:55`)

---

## 5. Auth + role gating

**Source of truth: `clinics.sku`** (text column constrained to `internal | pilot | prod`).
- Flows: DB → `user_clinic_context` view → `UserSessionContext.clinicContext.sku` (loaded by `loadUserData`, ~50 LOC of context).
- Read sites today: only `useSku()` reads `clinicContext.sku`.
- New read sites: `PilotRoute`, `InternalRoute`, `LegacyAppRedirect`, `Login.tsx` destination.

**No new boolean is introduced.** `clinics.is_pilot` does not exist and shouldn't — `sku` already encodes more states (`prod` will matter once production clinics arrive) and changing it is a single admin action in `/admin/clinics`.

**Admin override:** admins synthetically see `sku='internal'`. They will never hit `/pilot/*` because they live entirely at `/admin/*` (`ProtectedRoute → isAdmin → /admin` is preserved by the new guards).

**`prod` tier (currently in DB, missing from frontend):** map to `pilot` tree until product decides — see Q4.

---

## 6. Migration sequence

Each phase is independently shippable. Estimates assume one focused engineer.

| Phase | Scope | Ship value | Time |
|---|---|---|---|
| **0. Audit & freeze** | Lock down the file list above. Add CI grep that fails on new `isPilot` introductions in `/src/pages/internal/**` and `/src/pages/pilot/**`. | Prevents drift during migration. | 0.5 day |
| **1. Routing skeleton** | Add `/pilot` and `/internal` route trees in `App.tsx` mounting the existing pages (no file moves yet, just two new sets of `<Route>` entries pointing at the same components). Add `PilotRoute`/`InternalRoute` guards. Add `LegacyAppRedirect` for `/app/*`. Update `Login.tsx` destination. | Deep links resolve under both old and new URLs. No UX change. | 1.5 days |
| **2. Shell + sidebar split** | Split `AppLayout.tsx` into `AppShell` + `PilotLayout` + `InternalLayout`. `PilotSidebar` has 3 items; `InternalSidebar` has full nav. Drop `visibleNav` filtering since each sidebar is now a literal list. | First visible divergence: pilot sidebar is a literal three-item list, not a filter. | 1 day |
| **3. Move shared pages** | Move 12 unbranched pages to `src/pages/shared/` and reroute from both trees. | Forces import-graph cleanup; flushes circular deps before the hard splits. | 1 day |
| **4. Split Studies + Dashboard + Wallet** | Promote `PilotStudiesView` → `pages/pilot/PilotStudies`, `PilotDashboard` → `pages/pilot/PilotDashboard`. Split `Wallet.tsx`. Wire pilot tree to pilot pages and internal tree to internal pages. Delete the three dispatcher pages in `pages/app/`. | First page-level split is real. Bundles for pilot drop noticeably (`useStudiesData` full table no longer included). | 1.5 days |
| **5. Split StudyDetail** | Extract `useStudyDetail*` data hooks → `src/hooks/`. Extract `SignReportSurface` (taking next-link as prop). Build `PilotStudyDetail` (overview + analysis only) and `InternalStudyDetail` (full tabs). | The largest mixed file is gone. Auditable per-audience surface. | 2 days |
| **6. Split StudyUploadWizard** | Extract `uploadCore.ts` (helpers, bundle detection, EDF parsing, blob upload). Build `PilotUploadDialog` (2 steps) and `InternalUploadDialog` (3 steps). Wire from each tree's Studies page. | The second-largest mixed file is gone. Pilot wizard ships fewer KB. | 2 days |
| **7. Split SlaSelectionModal + StudyFlowProgress** | Two small mechanical splits. | Removes the last branched UI components. | 0.5 day |
| **8. Refactor NotificationBell** | Make `defaultTab` a prop. | Final `isPilot` read in shared components removed. | 0.25 day |
| **9. Verify + delete legacy** | `grep -r "isPilot" src/pages/pilot/ src/pages/internal/` returns nothing. `grep -r "/app/" src/` returns only `LegacyAppRedirect`. | Hard guarantee no mixing. | 0.5 day |
| **10. (Later, optional)** Remove `/app/*` redirects after 6+ months of monitoring redirect-hit telemetry. | Removes the last cross-tree dependency. | 0.25 day |

**Total: ~10 working days** for phases 0–9. Phases 1–3 (3 days) can land in week one to de-risk; the hard splits in week two.

---

## 7. Ranked risks

1. **Realtime subscriptions break on URL change.** `StudyDetail.tsx:209-242` opens a Supabase channel keyed off `study-detail-rt-${id}`. Channel names are global per tab — if a clinician navigates from `/app/studies/abc` → (redirect) → `/pilot/studies/abc` mid-poll, the cleanup-then-resubscribe must happen without dropping events between unmount and remount. Test: navigate while a study is in `processing` state and confirm progress updates resume. Mitigation: keep channel logic inside the shared `useStudyDetail` hook so both screens use identical subscription lifecycle.
2. **Email deep links pinned to `/app/studies/:id`.** Clinicians have saved links from earlier toast notifications. `LegacyAppRedirect` must preserve the path tail and query string exactly, and it must not redirect to `/pilot/*` for an internal user (or vice-versa). Mitigation: redirect target reads `sku` from session before redirecting; add telemetry on first 30 days to count `/app/*` hits.
3. **Tree-shaking regression from shared imports.** If `src/pages/shared/SignalViewer.tsx` imports something pilot-flavored (e.g. `PilotSlaModal`), the pilot bundle picks up internal-only modules and vice-versa. Audit pass after phase 6 with `vite build --report` to confirm pilot bundle does not contain `InternalDashboard`, `Lanes`, `Reports`, `Notes`, `Files`, `StudyReview`. Goal: pilot bundle <60% of internal bundle size.
4. **Cache key collisions in TanStack Query.** Both `["pilot-studies"]` and `["dashboard-studies"]` are invalidated together. After split, each tree may invalidate only its own key. If a pilot user has an internal-style key in cache from a long-lived session, data goes stale. Mitigation: scope queryClient invalidations to the current tree; document in `useStudyDetail`.
5. **`useSku()` deletion creep.** Inside `src/pages/pilot/**` every `useSku().isPilot` read becomes `true` tautologically. Engineers may delete them — fine. They may also delete the *hook call*, breaking memoization stability if the result was used elsewhere. Mitigation: phase 9 grep-and-confirm, and code-review checklist for the migration.

---

## 8. Open questions (need product input before phase 5)

1. **Do pilot users get `/pilot/notes`, `/pilot/files`, `/pilot/support`, `/pilot/docs`?** Today pilot nav hides these (`PILOT_NAV` in `skuPolicy.ts:57`) but the routes are reachable. Recommended: route them under `/pilot/*` for support team to deep-link, but keep the sidebar lean. Confirm.
2. **Does pilot get a Report tab on StudyDetail?** Today, `StudyDetail.tsx:777` hides the Report tab when `isPilot`. Is this intentional (pilot signs from the Analysis tab) or a holdover from when pilot didn't have signing? Affects whether `SignReportSurface` is shared.
3. **Pilot Wallet ledger:** today pilot sees only the `PilotWalletCard`. Should pilot have any transaction history (even abbreviated)? Affects whether `wallet_transactions` query stays internal-only.
4. **What does `prod` SKU mean?** It's in the DB enum (migration `20260124045454`) but `SkuTier` only defines `internal | pilot`. When real customers go live, do they get a third tree (`/clinic/*`?) or do they fall under `/pilot/*` with a different DB flag? This affects whether the split is binary or n-ary.
5. **Should `/pilot/dashboard` exist?** Today pilot dashboard exists but pilot's primary landing is studies-list (the Dashboard nav item is in `PILOT_NAV`). Keep it routable but not the landing? Confirm.
6. **What's the rollback story?** If phase 5 ships and we discover bugs, do we revert just `App.tsx` (which routes `/pilot/*` back to old files via a feature flag) or full rollback? Need a flag plumbed through `App.tsx` before phase 5 ships.
7. **Mobile parity:** the pilot 2-step wizard and the internal 3-step wizard have different mobile heights. Any mobile-specific tweaks per tree, or carry over current behavior?

---

## Critical Files for Implementation

- `/Users/h/encephlian/src/App.tsx`
- `/Users/h/encephlian/src/components/upload/StudyUploadWizard.tsx`
- `/Users/h/encephlian/src/pages/app/StudyDetail.tsx`
- `/Users/h/encephlian/src/pages/app/Studies.tsx`
- `/Users/h/encephlian/src/components/AppLayout.tsx`

(Honorable mentions for phase 5+: `/Users/h/encephlian/src/hooks/useSku.ts`, `/Users/h/encephlian/src/components/ProtectedRoute.tsx`, `/Users/h/encephlian/src/pages/Login.tsx`, `/Users/h/encephlian/src/contexts/UserSessionContext.tsx`, `/Users/h/encephlian/src/shared/skuPolicy.ts`.)
