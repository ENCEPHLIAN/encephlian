

## Plan: Deterministic, Explainable System — No Silent Failures

### Problem
The system has multiple points where operations fail silently — swallowed errors, misleading status messages, and no guidance when things go wrong. A clinician in an underserved clinic with unreliable internet and inconsistent files needs the system to be honest and helpful at every step.

### Silent Failure Inventory (from code review)

| Location | Failure | Current Behavior |
|---|---|---|
| `StudyUploadWizard.tsx:362-365` | `parse_eeg_study` edge function fails | Swallowed with `console.warn` — clinician never knows |
| `StudyUploadWizard.tsx:273` | No `clinicId` available | Generic "Missing required data" toast — no guidance |
| `StudyUploadWizard.tsx:93-156` | EDF header extraction fails | Returns `null`, no user feedback |
| `StudyUploadWizard.tsx:491-495` | Proprietary format uploaded | Says "processed server-side" — nothing actually processes it |
| `StudyUploadWizard.tsx` | File > 20MB | No pre-check — upload starts, then fails at storage layer |
| `Lanes.tsx` | Query fails | Shows skeleton forever — no error state |
| `Dashboard.tsx` | Data fetch fails | Loading spinner with no timeout or error |
| `StudyDetail.tsx` | Study not found / fetch error | No structured error recovery |
| Upload flow | Network drops mid-upload | Progress bar freezes — no timeout or retry |

### Changes

**1. Create `src/lib/systemFeedback.ts` — Centralized explainability engine**
A small utility module with structured error reporting. Every failure gets: (a) what happened, (b) why it matters, (c) what to do next. No raw error messages shown to clinicians.

```text
systemFeedback.report({
  severity: 'warning' | 'error' | 'info',
  what: "EEG metadata extraction failed",
  why: "The file header may be malformed or truncated",
  action: "Your study was still created. A technician can re-upload if needed.",
  technical: error.message  // logged to console only
})
```

This renders as a persistent toast with clear hierarchy — not a 3-second flash.

**2. Fix `StudyUploadWizard.tsx` — 7 specific failure points**

- **Pre-upload file size check**: Before uploading, check `file.size > 20 * 1024 * 1024`. Show exact limit and suggest exporting shorter segments.
- **No clinic context**: Instead of "Missing required data", explain: "Your account is not assigned to a clinic. Contact your administrator to get set up."
- **EDF header extraction failure**: Show warning toast with: "Could not read file header. This sometimes happens with older machines. Your file will still be uploaded — metadata will be extracted server-side."
- **Parse edge function failure**: Replace `console.warn` with visible warning: "File uploaded successfully but automatic parsing did not complete. Your study is saved — an administrator can re-trigger processing."
- **Proprietary format honesty**: Replace "processed server-side" with: "This format (.e/.nk) requires export to EDF for immediate processing. Your file is saved and can be converted later. We recommend exporting as EDF from your machine."
- **Network timeout**: Add a 60-second timeout on the storage upload. If exceeded, show: "Upload timed out — this usually means a slow connection. Please try again on a stable network."
- **Upload progress honesty**: Replace fake interval-based progress with stage-based feedback: "Uploading file..." → "Creating study record..." → "Triggering analysis..." — each with a clear label.

**3. Fix `Lanes.tsx` — Query error state**
Add `isError` / `error` handling from `useStudiesData`. Show a compact error bar above the Kanban: "Could not load studies. Check your connection and refresh." with a retry button. No infinite skeleton.

**4. Fix `Dashboard.tsx` — Loading timeout + error state**
Add error boundary for `useDashboardData`. If loading exceeds 15 seconds, show: "Taking longer than expected. This could be a network issue." with retry.

**5. Fix `StudyDetail.tsx` — Study not found / load error**
Use the existing `ErrorPage` component for study-not-found. Show actionable message: "Study not found or you don't have access. It may have been deleted or belongs to another clinic."

**6. Fix `useStudiesData.ts` / `useDashboardData.ts` — Return error state**
Ensure both hooks expose `isError` and `error` so pages can render error UI instead of eternal loading.

### Files Modified
- `src/lib/systemFeedback.ts` — NEW, ~60 lines
- `src/components/upload/StudyUploadWizard.tsx` — 7 failure points fixed
- `src/pages/app/Lanes.tsx` — error state added
- `src/pages/app/Dashboard.tsx` — error + timeout state
- `src/pages/app/StudyDetail.tsx` — not-found error page
- `src/hooks/useStudiesData.ts` — expose error state
- `src/hooks/useDashboardData.ts` — expose error state

### What Does NOT Change
- Database schema, RLS policies, edge functions
- Auth flows, routing, admin pages
- EEG Viewer, inference pipeline

