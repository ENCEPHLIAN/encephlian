# ENCEPHLIAN Architecture Changes Summary

**Last Updated:** January 2026  
**Version:** MVP Pre-Pilot  
**Team Discussion Document**

---

## Table of Contents

1. [SKU-Based Experience Plane Differentiation](#1-sku-based-experience-plane-differentiation)
2. [Pilot-Specific UI Components](#2-pilot-specific-ui-components)
3. [Storage RLS Compliance Fix](#3-storage-rls-compliance-fix)
4. [UserSessionContext Hardening](#4-usersessioncontext-hardening)
5. [Admin UI Cleanup](#5-admin-ui-cleanup)
6. [Database Schema Status](#6-database-schema-status)
7. [Edge Functions Status](#7-edge-functions-status)
8. [AI/ML Integration Roadmap](#8-aiml-integration-roadmap)
9. [Known Gaps](#9-known-gaps)
10. [File Reference](#10-file-reference)

---

## 1. SKU-Based Experience Plane Differentiation

The architecture implements a **unified core engine** with SKU-based UI differentiation at the Experience Plane (E-Plane) only. No schema or RLS changes between tiers.

| Aspect | Pilot SKU | Internal SKU |
|--------|-----------|--------------|
| **Target Users** | Paid pilot clinics | Internal dev/ops team |
| **Navigation** | Dashboard, Studies, Wallet only | Full navigation (Lanes, Reports, Viewer, Files, Notes, Templates, etc.) |
| **Branding** | Clinic's `brand_name` from DB | "ENCEPHLIAN" |
| **API Access** | Must use `read_api_proxy` (no exposed keys) | Direct Read API access allowed |
| **Token Model** | 1 token (TAT) / 2 tokens (STAT) per triage | Same |
| **Value Proposition** | "EEG Upload → Accelerated Triage → Report" | Full informatics platform |

### SKU Policy Definition

```typescript
// src/shared/skuPolicy.ts
export type SkuTier = 'internal' | 'pilot';

export interface SkuCapabilities {
  canRunInference: boolean;
  canViewRawEEG: boolean;
  canExportData: boolean;
  mustUseReadApiProxy: boolean;
  showFullNavigation: boolean;
  maxStudiesPerMonth: number | null;
  tokenCostTAT: number;
  tokenCostSTAT: number;
}
```

### Navigation Visibility

```typescript
// Pilot: Streamlined value-focused navigation
const PILOT_NAV: NavItemId[] = ['dashboard', 'studies', 'wallet'];

// Internal: Full platform access
const INTERNAL_NAV: NavItemId[] = [
  'dashboard', 'studies', 'lanes', 'reports', 'viewer',
  'files', 'notes', 'templates', 'wallet', 'support'
];
```

---

## 2. Pilot-Specific UI Components

### Component Mapping

| Component | Location | Purpose |
|-----------|----------|---------|
| `PilotStudiesView` | `src/components/pilot/PilotStudiesView.tsx` | Card-based upload + triage queue (replaces complex table) |
| `PilotDashboard` | `src/components/dashboard/PilotDashboard.tsx` | Streamlined KPIs + pending triage section |
| `SlaSelectionModal` | `src/components/dashboard/SlaSelectionModal.tsx` | TAT/STAT selection with token deduction |
| `PilotWalletCard` | `src/components/sku/PilotWalletCard.tsx` | Simplified token balance display |

### Conditional Rendering Pattern

```tsx
// src/pages/app/Studies.tsx
export default function Studies() {
  const { sku } = useSku();
  
  if (sku === 'pilot') {
    return <PilotStudiesView />;
  }
  
  return <InternalStudiesView />;
}
```

---

## 3. Storage RLS Compliance Fix

### Problem

EDF file uploads were failing with:
```
new row violates row-level security policy for table "objects"
```

### Root Cause

Storage bucket RLS policies enforce user path ownership:

```sql
-- Storage RLS policy on eeg-raw bucket
(auth.uid())::text = (storage.foldername(name))[1]
```

This means upload paths **must** be prefixed with the authenticated user's UUID.

### Solution Applied

```typescript
// BEFORE (broken - anonymous path)
const filePath = `${Date.now()}-${file.name}`;

// AFTER (RLS compliant - user-scoped path)
const filePath = `${userId}/${Date.now()}-${file.name}`;
```

### Files Changed

- `src/components/pilot/PilotStudiesView.tsx`
- `src/pages/app/Studies.tsx`

---

## 4. UserSessionContext Hardening

### Changes Made

The `UserSessionContext` was refactored to ensure authenticated requests always have a valid session token for RLS compliance.

#### Before

```typescript
const loadUserData = useCallback(async (user: User) => {
  // Session not stored, only user object
  setState({ user, session: null, ... });
});
```

#### After

```typescript
const loadUserData = useCallback(async (session: Session) => {
  const user = session.user;
  // Full session object stored with access_token
  setState({ user, session, userId: user.id, ... });
});
```

### Auth Event Consolidation

```typescript
// All these events now trigger full session reload
if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session?.user) {
  loadUserData(session);
}
```

### Hard Gate Before Storage Operations

```typescript
// Added to all upload handlers
const { data: { session } } = await supabase.auth.getSession();
if (!session?.access_token) {
  toast.error("Session expired", { description: "Please sign in again." });
  navigate("/login", { replace: true });
  return;
}
```

### File Changed

- `src/contexts/UserSessionContext.tsx`

---

## 5. Admin UI Cleanup

### Changes

1. **Removed** `ClinicSelectorDropdown` from admin sidebar
2. **Updated** internal clinic's `brand_name` to "ENCEPHLIAN" (was default "Clinical Portal")

### File Changed

- `src/components/admin/AdminLayout.tsx`

---

## 6. Database Schema Status

### No Schema Changes Required

All SKU differentiation is handled at the E-Plane. The unified schema supports both tiers:

| Table | Purpose | SKU Impact |
|-------|---------|------------|
| `clinics` | Multi-tenant clinic records | `sku` column drives entitlement |
| `studies` | EEG study records | Shared by all SKUs |
| `wallets` | Token balances | Same token model |
| `study_reports` | AI-generated triage reports | Shared storage |
| `clinic_memberships` | User-clinic relationships | Unchanged |
| `user_roles` | Admin role assignments | Unchanged |

### SKU Column

```sql
-- clinics table
sku TEXT NOT NULL DEFAULT 'pilot'
-- Valid values: 'internal', 'pilot'
```

### RLS Policies

All RLS policies remain unified and unchanged. Multi-tenant isolation is enforced via:
- `clinic_memberships` for clinic-scoped access
- `user_roles` for admin privilege escalation
- `auth.uid()` path prefix for storage buckets

---

## 7. Edge Functions Status

| Function | Purpose | JWT Required | Status |
|----------|---------|--------------|--------|
| `create_study_from_upload` | Windows uploader ingestion | ✅ Yes | Ready |
| `read_api_proxy` | Secure proxy for Pilot SKU | ✅ Yes | Ready |
| `generate_ai_report` | Placeholder report generation | ✅ Yes | Ready (needs real AI) |
| `parse_eeg_study` | EDF/BDF parsing | ✅ Yes | Ready |
| `create_order` | Razorpay order creation | ✅ Yes | Ready |
| `verify_payment` | Payment verification | ✅ Yes | Ready |
| `send_triage_notification` | Email notifications | ✅ Yes | Ready |

### Read API Proxy

For Pilot SKU, all inference calls must go through the proxy to avoid exposing the `READ_API_KEY`:

```typescript
// Pilot flow
const response = await supabase.functions.invoke('read_api_proxy', {
  body: { 
    endpoint: `/studies/${studyKey}/inference/run`,
    method: 'POST'
  }
});

// Internal flow (direct)
const response = await fetch(`${READ_API_BASE}/studies/${studyKey}/inference/run`, {
  headers: { 'X-API-Key': READ_API_KEY }
});
```

---

## 8. AI/ML Integration Roadmap

```
┌─────────────────────────────────────────────────────────────────────┐
│                        INFERENCE PLANE                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Phase 1: Pretrained Models (MVP)                                   │
│  ├─ Azure ML endpoint for accelerated triage                        │
│  ├─ Event detection (spikes, seizures, artifacts)                   │
│  └─ 5000 USD Azure credits until Aug 2026                           │
│                                                                     │
│  Phase 2: Fine-tuned Models (Post-Pilot)                            │
│  ├─ Domain-specific training on Indian EEG datasets                 │
│  ├─ Clinic-specific calibration                                     │
│  └─ Improved accuracy for regional patterns                         │
│                                                                     │
│  Phase 3: Ensemble (Scale)                                          │
│  ├─ Multi-model voting for improved accuracy                        │
│  ├─ Confidence scoring and uncertainty quantification               │
│  └─ Automatic model selection based on EEG characteristics          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Integration Points

```typescript
// studies table columns for inference tracking
{
  study_key: string;        // External reference for Read API
  latest_run_id: string;    // Most recent inference run ID
  triage_status: string;    // 'pending' | 'processing' | 'completed' | 'failed'
  triage_progress: number;  // 0-100 progress percentage
}

// study_reports table for storing results
{
  study_id: uuid;
  run_id: string;
  content: jsonb;           // Structured triage results
  report_html: string;      // Rendered HTML report
}
```

---

## 9. Known Gaps

### Critical (Blocking Pilot Launch)

| Gap | Current State | Required Action |
|-----|---------------|-----------------|
| **Accelerated Triage** | `simulateTriageProgress()` is placeholder | Connect to Azure ML endpoint |
| **Report Generation** | Placeholder deterministic output | Integrate real AI inference results |

### Important (Post-Pilot)

| Gap | Current State | Required Action |
|-----|---------------|-----------------|
| **Multi-file EEG** | Single EDF only | Add batch upload + file association |
| **Windows Uploader Auto-triage** | Edge function exists | Wire to inference pipeline |
| **Real-time Updates** | Polling-based | Add Supabase Realtime subscriptions |

### Nice-to-Have

| Gap | Current State | Required Action |
|-----|---------------|-----------------|
| **Pipeline Timeline UI** | None | Visual status tracker for triage progress |
| **Session Health Indicator** | Hidden | Surface auth state in UI |

---

## 10. File Reference

### Core SKU Policy

```
src/shared/skuPolicy.ts          # SKU definitions and capabilities
src/hooks/useSku.ts              # React hook for SKU access
src/components/SkuGate.tsx       # Conditional rendering component
```

### Pilot Components

```
src/components/pilot/PilotStudiesView.tsx
src/components/dashboard/PilotDashboard.tsx
src/components/dashboard/SlaSelectionModal.tsx
src/components/sku/PilotWalletCard.tsx
```

### Authentication

```
src/contexts/UserSessionContext.tsx   # Hardened session management
src/components/ProtectedRoute.tsx     # Route protection
```

### Edge Functions

```
supabase/functions/read_api_proxy/index.ts
supabase/functions/create_study_from_upload/index.ts
supabase/functions/generate_ai_report/index.ts
supabase/functions/parse_eeg_study/index.ts
```

### Admin

```
src/components/admin/AdminLayout.tsx
src/pages/admin/AdminClinics.tsx      # SKU management UI
```

---

## Appendix: Environment Variables

| Variable | Purpose | Required For |
|----------|---------|--------------|
| `VITE_SUPABASE_URL` | Supabase project URL | All |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon key | All |
| `READ_API_KEY` | External inference API | Internal SKU / Proxy |
| `RAZORPAY_KEY_ID` | Payment processing | Token purchases |
| `RAZORPAY_KEY_SECRET` | Payment verification | Token purchases |

---

## 11. Security Hardening (Latest)

### RLS Recursion Fix
All remaining `my_memberships` view references in RLS policies have been replaced with direct `clinic_memberships` table joins. This eliminates the infinite recursion risk that previously froze the platform.

**Policies fixed:**
- `studies.studies_insert` — INSERT policy
- `study_files.files_scope` — SELECT policy
- `eeg_markers.markers_insert` — INSERT policy
- `report_attachments.report_attachments_own_clinic` — ALL policy (also added admin access)

### Auth Configuration
- **Anonymous signups**: Disabled
- **Public signups**: Disabled (admin-only user creation)
- **Email auto-confirm**: Disabled (email verification required)
- **Password reset**: Proper `/reset-password` page with `PASSWORD_RECOVERY` event handling

### Password Reset Flow
```
User → Forgot Password → Email sent with redirectTo=/reset-password
→ User clicks link → /reset-password page detects type=recovery
→ User enters new password → supabase.auth.updateUser({ password })
→ Redirect to /login
```

---

*Document prepared for ENCEPHLIAN team discussion. For questions, contact the platform engineering team.*
