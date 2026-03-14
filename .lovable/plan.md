

# Make Pilot Version Blazingly Fast and No-Brainer

## Current State Assessment

The Pilot SKU already has a clean separation (Dashboard, Studies, Wallet only) but has several friction points and performance gaps that prevent it from feeling "blazingly fast":

### Issues Found

1. **Double data fetching**: `PilotStudiesView` imports BOTH `useStudiesData` AND `useDashboardData` — two separate queries hitting the same `studies` table simultaneously. Same problem on `PilotDashboard` which uses `useDashboardData` (a heavy hook with metrics, realtime, wallet — all computed even though Pilot only needs 3 cards).

2. **No upload wizard in Pilot**: The upload in `PilotStudiesView` is a raw file input click — no patient metadata entry, no drag-and-drop visual feedback, no progress indicator beyond a spinner. The `StudyUploadWizard` (755-line wizard with EDF header parsing) exists but isn't used in Pilot.

3. **Realtime channel duplication**: `useDashboardData` creates a realtime channel on ALL studies (no user filter), while `useStudiesData` creates another filtered channel. Pilot pages mount both.

4. **No skeleton/optimistic UI**: Loading states show a pulsing logo with no skeleton cards. Users see a blank screen → logo pulse → content jump.

5. **SLA modal is 2-step**: User clicks "Start Triage" → sees TAT/STAT cards → clicks one → sees confirmation → clicks "Begin Analysis". That's 3 clicks for the core action. Should be 2 max.

6. **Missing drag-and-drop**: Upload card says "Click or drag" but has no `onDragOver`/`onDrop` handlers.

7. **Wallet page is disconnected**: Pilot wallet shows `PilotWalletCard` but clicking token balance on Dashboard navigates to `/app/wallet` — an extra page load for what could be an inline expansion.

## Plan

### 1. Eliminate duplicate data fetching
- Create a lightweight `usePilotData` hook that does ONE query for studies + ONE for wallet balance, with a single realtime channel filtered by `owner=eq.${userId}`.
- Replace both `useDashboardData` and `useStudiesData` imports in Pilot components with this single hook.
- Remove the heavy metrics computation (KPI calculations, turnaround averages) from the Pilot code path entirely.

### 2. Add skeleton loading states
- Replace the logo-pulse loading screen with skeleton cards that match the final layout (upload area skeleton, pending cards skeleton, completed cards skeleton).
- Use `Skeleton` from existing shadcn components — instant perceived performance.

### 3. Streamline SLA selection to 1-tap
- Redesign `SlaSelectionModal` for Pilot: instead of a 2-step modal (select → confirm), show a single-step inline action with two buttons directly: "Standard (1 token)" / "Priority (2 tokens)" — one tap starts triage.
- Keep the confirmation step only for STAT (2-token deduction) as a safety net.

### 4. Add drag-and-drop upload
- Add `onDragOver`, `onDragLeave`, `onDrop` handlers to the upload card in `PilotStudiesView`.
- Visual feedback: border color change + "Drop to upload" text on drag-over.

### 5. Integrate upload wizard into Pilot flow
- Wire the existing `StudyUploadWizard` dialog into the Pilot upload card click, so users get proper patient metadata entry and EDF header parsing instead of a blind file input.

### 6. Prefetch and optimistic updates
- After SLA selection, optimistically update the study card to "Processing" state before the RPC resolves.
- Prefetch wallet balance on app mount so it's instant when navigating to Dashboard.

### 7. Reduce navigation friction
- Show token balance inline on the PilotDashboard header as a non-navigating display (remove the click-to-wallet behavior from the chip, add a small "Add" button instead).
- After upload + SLA selection, auto-scroll to the processing card.

### Technical Details

```text
Current Pilot data flow:
  PilotDashboard ──> useDashboardData ──> 2 queries + realtime (unfiltered)
  PilotStudiesView ──> useStudiesData + useDashboardData ──> 3 queries + 2 realtime channels

Optimized flow:
  PilotDashboard ──> usePilotData ──> 1 studies query + 1 wallet query + 1 filtered realtime
  PilotStudiesView ──> usePilotData (shared cache via queryKey) ──> 0 extra queries
```

### Files to create/modify:
- **Create** `src/hooks/usePilotData.ts` — single lightweight hook
- **Modify** `src/components/dashboard/PilotDashboard.tsx` — use new hook, skeleton loading, inline token display
- **Modify** `src/components/pilot/PilotStudiesView.tsx` — use new hook, drag-and-drop, wizard integration, skeleton loading
- **Modify** `src/components/dashboard/SlaSelectionModal.tsx` — add `isPilot` prop for 1-tap mode (skip confirmation for TAT)
- No database changes required.

