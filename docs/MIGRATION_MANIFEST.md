# ENCEPHLIAN Migration Manifest

**Purpose:** Component-by-component mapping for Azure migration.  
**Current Platform:** Supabase (via Lovable Cloud)  
**Target Platform:** Azure Cloud

---

## Supabase → Azure Mapping

| Current (Supabase) | Azure Equivalent | Files Affected |
|---|---|---|
| Supabase Auth | Azure AD B2C / MSAL | `src/contexts/UserSessionContext.tsx`, `src/pages/Login.tsx` |
| Supabase Database (Postgres) | Azure Database for PostgreSQL | All hooks in `src/hooks/`, all RPC calls |
| Supabase Storage | Azure Blob Storage | Upload flows in `src/components/pilot/`, `src/pages/app/Studies.tsx` |
| Supabase Edge Functions | Azure Functions | `supabase/functions/*/index.ts` (17 functions) |
| Supabase Realtime | Azure SignalR / Web PubSub | `src/hooks/useDashboardData.ts` |
| Supabase RLS | Postgres RLS (same, runs on Azure PG) | No code change — RLS is Postgres-native |
| Supabase Client SDK | Custom API client | `src/integrations/supabase/client.ts` |

## Abstraction Points

All Supabase SDK usage flows through:
1. **`src/integrations/supabase/client.ts`** — Single client instance (auto-generated, replace with Azure SDK)
2. **`src/contexts/UserSessionContext.tsx`** — Auth state (replace `supabase.auth.*` with MSAL)
3. **`src/hooks/`** — All data fetching (replace `supabase.from()` with Azure PG client or REST API)

## Edge Functions to Migrate

| Function | Purpose | Azure Target |
|---|---|---|
| `create_order` | Razorpay order creation | Azure Function |
| `verify_payment` | Payment verification | Azure Function |
| `create_study_from_upload` | Windows uploader ingestion | Azure Function |
| `read_api_proxy` | Secure inference proxy | Azure API Management |
| `generate_ai_report` | AI report generation | Azure Function + Azure ML |
| `parse_eeg_study` | EDF/BDF parsing | Azure Function |
| `admin_create_user` | Admin user creation | Azure Function + AD B2C |
| `send_support_email` | Email notifications | Azure Communication Services |
| `send_triage_notification` | Triage alerts | Azure Communication Services |
| `submit_support_ticket` | Support ticket creation | Azure Function |

## Database Functions (RPC)

All 30+ SECURITY DEFINER functions in Postgres migrate as-is to Azure Database for PostgreSQL. No code changes needed — they are standard PL/pgSQL.

## Storage Buckets

| Bucket | Purpose | Azure Blob Container |
|---|---|---|
| `eeg-raw` | Raw EEG files | `eeg-raw` container |
| `eeg-uploads` | User uploads | `eeg-uploads` container |
| `eeg-json` | Canonical JSON | `eeg-json` container |
| `eeg-reports` | Generated reports | `eeg-reports` container |
| `notes` | User notes attachments | `notes` container |

## Migration Steps

1. **Database**: Export schema + RLS policies → Apply to Azure PG
2. **Auth**: Replace Supabase Auth SDK with MSAL.js, update UserSessionContext
3. **Storage**: Replace `supabase.storage` calls with Azure Blob SDK
4. **Edge Functions**: Port each to Azure Functions (same Deno/Node runtime)
5. **Realtime**: Replace Supabase channels with Azure SignalR
6. **Client**: Create new client abstraction replacing `src/integrations/supabase/client.ts`
7. **Environment**: Update `.env` variables for Azure endpoints

## What Does NOT Change

- All React components, routing, and UI
- SKU policy system (`src/shared/skuPolicy.ts`)
- RLS policies (Postgres-native, works on any PG)
- Business logic in hooks (only the data fetching layer changes)
- Admin layout and navigation structure
