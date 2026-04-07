# ENCEPHLIAN: Complete Azure Migration & Infrastructure Strategy

**Status:** Strategic Blueprint for MVP → Production-Ready Transition
**Date:** March 2026
**Target:** Zero Technical Debt, Multi-SKU Scaling, $25K Budget Optimization
**Audience:** Founding Team, Infrastructure/Ops Planning

---

## EXECUTIVE SUMMARY

You're migrating from **Lovable Cloud + Supabase** to a **fully Azure-native, SKU-aware, multi-replica infrastructure** that supports:

- **4 Deployment Tracks:** Internal-Stable, Internal-Experimental, Pilot-Stable, Pilot-Experimental
- **Auto-scaling:** Cost-optimized with idle time minimization (Pod autoscaling, function scaling)
- **CI/CD:** GitHub Actions → Azure Deployment (independent per-SKU/version deployments)
- **Open-source A-Plane:** Community-driven vendor adapter contributions
- **Operational Simplicity:** IaC (Terraform), observability (Azure Monitor), cost alerts

**Current State:**
- Backend (encephlian-core): Already on Azure Container Apps (1 replica) ✅
- Frontend (encephlian): Still on Lovable Cloud + Supabase ❌
- Database: Supabase Postgres (needs migration) ❌
- Storage: Supabase Storage (needs migration) ❌
- Auth: Supabase Auth (needs migration) ❌
- Edge Functions: 18 Supabase functions (needs replacement) ❌

**Migration Path:**
1. **Phase 1 (Weeks 1-3):** IaC setup, Azure DB migration, auth replacement
2. **Phase 2 (Weeks 4-6):** Storage, edge functions, frontend hosting
3. **Phase 3 (Weeks 7-9):** CI/CD, auto-scaling, cost optimization
4. **Phase 4 (Weeks 10-12):** Production cutover, monitoring, runbooks

---

## 1. ARCHITECTURE: FROM LOVABLE → AZURE-NATIVE

### Current Stack (Lovable Cloud)
```
┌─────────────────────────────────────────────────────────┐
│ Lovable Cloud IDE (Dev Environment)                      │
│ ├─ Vite + React + TypeScript                             │
│ ├─ Hosted at lovable.dev (dev/staging)                   │
│ └─ Exports to encephlian/src                             │
├─────────────────────────────────────────────────────────┤
│ Supabase (Auth + DB + Storage + Realtime + Functions)   │
│ ├─ Auth: JWT-based auth + RLS                            │
│ ├─ Database: PostgreSQL (86 migrations)                  │
│ ├─ Storage: S3-compatible buckets (clinic files, EEGs)  │
│ ├─ Realtime: WebSocket subscriptions for triage updates │
│ └─ Edge Functions: 18 serverless functions              │
├─────────────────────────────────────────────────────────┤
│ Read API Backend (Already on Azure)                      │
│ ├─ Azure Container Apps: enceph-readapi (1 replica)     │
│ ├─ Python FastAPI + Uvicorn                              │
│ └─ Data: /app/data (TUH_CANON_001 study)               │
└─────────────────────────────────────────────────────────┘
```

### Target Stack (Azure-Native)
```
┌────────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND TIER                                                                    │
├────────────────────────────────────────────────────────────────────────────────┤
│ Azure Static Web Apps OR App Service                                            │
│ ├─ Vite + React + TypeScript (build artifacts)                                 │
│ ├─ CDN + SSL (automatic)                                                        │
│ ├─ Custom domain + staging slots                                               │
│ └─ Client-side: Stored in blob storage + CDN                                   │
├────────────────────────────────────────────────────────────────────────────────┤
│ AUTHENTICATION & API GATEWAY                                                    │
├────────────────────────────────────────────────────────────────────────────────┤
│ Azure AD B2C (or Entra ID for enterprise) + API Management                     │
│ ├─ Identity provider: Social + Email/Password + SAML                           │
│ ├─ Token issuance: JWT (compatible with current RLS)                           │
│ ├─ API gateway: Route, throttle, cache API calls                               │
│ └─ Custom claims: clinic_id, sku (used in RLS policies)                        │
├────────────────────────────────────────────────────────────────────────────────┤
│ DATA TIER                                                                        │
├────────────────────────────────────────────────────────────────────────────────┤
│ Azure Database for PostgreSQL (Flexible Server)                                 │
│ ├─ Same schema as Supabase (86 migrations fully ported)                        │
│ ├─ RLS: Same policies (clinic_id based isolation)                              │
│ ├─ Replication: Multi-AZ for HA (geo-redundancy optional)                      │
│ └─ Backup: 7-day retention automatic                                            │
│                                                                                  │
│ Azure Blob Storage (with SAS tokens)                                            │
│ ├─ Clinic files: /clinics/{clinic_id}/uploads/                                │
│ ├─ EEG signals: /eeg/{study_id}/signals.zarr/                                 │
│ └─ Reports: /reports/{clinic_id}/{report_id}/                                 │
├────────────────────────────────────────────────────────────────────────────────┤
│ BACKEND TIER (Multi-Replica, SKU-Aware)                                         │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│ READ API REPLICAS (C-Plane + I-Plane):                                         │
│ ├─ Internal-Stable    [2 replicas] ← Production internal usage                │
│ ├─ Internal-Experimental [1 replica] ← Dev/testing                            │
│ ├─ Pilot-Stable       [2 replicas] ← Customer-facing                          │
│ └─ Pilot-Experimental [1 replica] ← Staging for pilots                        │
│                                                                                  │
│ All running: Azure Container Apps (auto-scale 1-10 based on CPU)              │
│ Environment: Docker image (Python 3.12 slim, ~250MB)                           │
│ Data source: Azure Blob Storage + PostgreSQL                                   │
│ Health checks: /health endpoint (30s interval)                                 │
│                                                                                  │
│ SERVERLESS FUNCTIONS (replacing 18 Supabase Edge Functions):                  │
│ ├─ Azure Functions (Python runtime)                                             │
│ ├─ HTTP triggers: read_api_proxy, triage_runner, report_generator             │
│ ├─ Timer triggers: cron jobs (study cleanup, stats aggregation)               │
│ └─ Queue/Topic triggers: Async processing (file uploads, inference runs)      │
│                                                                                  │
│ REALTIME SIGNALING (replacing Supabase Realtime):                             │
│ ├─ Azure SignalR Service (managed WebSocket)                                   │
│ ├─ Hub: TriageUpdates (study state changes, triage progress)                  │
│ └─ Client subscription: Auto-refresh UI on triage completion                  │
├────────────────────────────────────────────────────────────────────────────────┤
│ OBSERVABILITY & COST                                                            │
├────────────────────────────────────────────────────────────────────────────────┤
│ Azure Monitor:                                                                   │
│ ├─ Metrics: CPU, memory, request count (per replica/SKU)                      │
│ ├─ Logs: Application logs + audit logs (clinic activity)                      │
│ ├─ Alerts: Auto-scale triggers, error rate > 1%, latency > 500ms              │
│ └─ Dashboards: Real-time view of system health + costs                        │
│                                                                                  │
│ Azure Cost Management:                                                           │
│ ├─ Budget alerts: $2k/month threshold                                          │
│ ├─ Daily spend dashboard                                                        │
│ ├─ Reserved instances: If usage patterns stabilize (post-MVP)                 │
│ └─ Auto-shutdown: Dev/test resources after hours                              │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. MULTI-SKU, MULTI-REPLICA DEPLOYMENT STRATEGY

### Deployment Model: 4 Independent Tracks

Each SKU (Internal, Pilot) has 2 versions (Stable, Experimental), deployed independently with separate:
- Container images
- Database schemas (shared, but SKU-specific feature flags)
- Environment configurations
- Replicas & scaling rules
- Monitoring + cost tracking

**Directory Structure (IaC + Configs):**
```
encephlian-core/
├── terraform/
│   ├── main.tf                     # Global: RG, storage, DB
│   ├── container_apps.tf           # 4 Container Apps (one per track)
│   ├── functions.tf                # Azure Functions
│   ├── signalr.tf                  # SignalR Service
│   ├── monitoring.tf               # Alert rules, action groups
│   ├── variables.tf                # Parameterization
│   └── secrets.tfvars (Git-ignored)
├── .github/workflows/
│   ├── deploy-internal-stable.yml
│   ├── deploy-internal-experimental.yml
│   ├── deploy-pilot-stable.yml
│   └── deploy-pilot-experimental.yml
├── docker/
│   ├── Dockerfile.read_api         # Base image (all tracks use this)
│   └── .dockerignore
└── .env.templates/
    ├── .env.internal-stable
    ├── .env.internal-experimental
    ├── .env.pilot-stable
    └── .env.pilot-experimental
```

### Replica Strategy

| Track | Replicas | Min/Max | SLA Target | Use Case |
|-------|----------|---------|------------|----------|
| **Internal-Stable** | 2 (1 always on) | 1-4 | 99.5% (1 9s) | Prod triage for clinics |
| **Internal-Experimental** | 1 | 1-2 | 95% (best effort) | Dev/testing new features |
| **Pilot-Stable** | 2 (1 always on) | 1-3 | 99.5% (1 9s) | Paying pilot customers |
| **Pilot-Experimental** | 0 (on-demand) | 0-1 | N/A | Staging for pilots |

**Auto-scaling Rules:**
- Trigger: CPU > 70% OR request latency > 500ms
- Scale up: Add 1 replica (up to max)
- Scale down: CPU < 20% for 5 minutes → remove replica (keep min)
- Cooldown: 2 minutes between scaling events

**Cost Impact (Estimated on $25k budget):**
- Always-on minimum (2 replicas): ~$600/month
- Variable cost (spike load): ~$100-200/month
- Database (Flexible, 2-4 vCore): ~$300-500/month
- Storage (Blob + Archive): ~$50-100/month
- Functions (pay-per-execution): ~$20-50/month
- SignalR (Standard tier): ~$100/month
- **Total: ~$1,200-1,500/month (well within budget)**

---

## 3. DATABASE MIGRATION: Supabase → Azure PostgreSQL

### Schema Migration Plan

**Step 1: Export Supabase Schema + Data**
```bash
# Dump entire DB (schema + data)
pg_dump --host=db.supabase.co \
        --username=postgres \
        --password \
        --format=custom \
        --file=supabase_backup.sql \
        postgres

# Or use Supabase UI export
```

**Step 2: Create Azure PostgreSQL Flexible Server**
```bash
# Terraform or Azure CLI
az postgres flexible-server create \
  --resource-group encephlian-rg \
  --name enceph-postgres-prod \
  --admin-user postgres \
  --admin-password <strong-password> \
  --sku-name Standard_B2s \
  --tier Burstable \
  --storage-size 32 \
  --version 14 \
  --high-availability Enabled \
  --geo-redundant-backup Enabled
```

**Step 3: Restore Data**
```bash
# Create target database
createdb -h enceph-postgres-prod.postgres.database.azure.com \
         -U postgres \
         -W \
         encephlian

# Restore dump
pg_restore --host=enceph-postgres-prod.postgres.database.azure.com \
           --username=postgres \
           --password \
           --format=custom \
           --create \
           --clean \
           --if-exists \
           supabase_backup.sql
```

**Step 4: Verify Migration**
```sql
-- Check row counts match
SELECT schemaname, tablename, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;

-- Verify indexes, constraints
SELECT * FROM pg_indexes WHERE schemaname = 'public';

-- Test RLS policies
SET SESSION app.current_clinic_id = 'clinic_123';
SELECT * FROM studies LIMIT 5;  -- Should only return clinic_123 studies
```

### RLS Policies: Identical to Supabase

**Key Policies (no changes needed):**
```sql
-- Clinics: Users can only see their own clinic
CREATE POLICY clinic_isolation ON clinics
  FOR SELECT USING (
    id = (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- Studies: Clinic-level isolation
CREATE POLICY study_clinic_isolation ON studies
  FOR SELECT USING (
    clinic_id = (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- Files: Clinic + user isolation
CREATE POLICY file_clinic_isolation ON files
  FOR SELECT USING (
    clinic_id = (SELECT clinic_id FROM users WHERE id = auth.uid())
  );
```

**Trigger: Set app.current_clinic_id from JWT**
```sql
-- In Azure AD B2C custom claims or API middleware:
SET app.current_clinic_id = jwt_payload->>'clinic_id';
```

### Connection Pooling (Azure)

Use **PgBouncer** on Azure Container Apps as a reverse proxy:
```dockerfile
# Container: pgbouncer-proxy (lightweight, ~10MB)
FROM pgbouncer:latest
COPY pgbouncer.ini /etc/pgbouncer/pgbouncer.ini
CMD ["pgbouncer", "-d", "/etc/pgbouncer/pgbouncer.ini"]
```

**pgbouncer.ini:**
```ini
[databases]
encephlian = host=enceph-postgres-prod.postgres.database.azure.com \
             port=5432 \
             user=postgres \
             password=<secret> \
             dbname=encephlian

[pgbouncer]
pool_mode = transaction
max_db_connections = 100
max_client_connections = 1000
default_pool_size = 20
min_pool_size = 10
reserve_pool_size = 5
```

**Benefits:**
- Reduces connection overhead (PostgreSQL max_connections=200)
- Improves latency (local pooling vs. cross-region)
- Allows 1000s of concurrent app connections on 100 DB connections

---

## 4. AUTHENTICATION: Supabase Auth → Azure AD B2C

### Migration Strategy

**Option A: Azure AD B2C (Recommended for clinics)**
- Multi-tenant identity provider
- Email/password, social logins (Google, Microsoft)
- MFA out-of-box
- Custom claims (clinic_id, sku, roles)
- Cost: ~$0.07 per auth event (monthly cost depends on usage)

**Option B: Entra ID (for enterprise clinics later)**
- SAML 2.0 / OAuth 2.0
- Windows Server AD integration
- Can be switched to post-MVP

### Implementation (OAuth 2.0 Code Flow)

**Step 1: Register App in Azure AD B2C**
```bash
az ad app create --display-name "encephlian-web" \
  --reply-urls "https://app.encephlian.com/auth/callback" \
  --public-client-flows "spa"
```

**Step 2: Frontend Code (React)**
```typescript
import { PublicClientApplication } from "@azure/msal-browser";

const msalConfig = {
  auth: {
    clientId: "YOUR_APP_ID",
    authority: "https://encephaliand.b2clogin.com/encephaliand.onmicrosoft.com/B2C_1_susi",
    redirectUri: "https://app.encephlian.com/auth/callback",
  },
};

const pca = new PublicClientApplication(msalConfig);

// Login
const loginRequest = {
  scopes: ["https://encephaliand.onmicrosoft.com/api/user.read"],
};
pca.loginPopup(loginRequest)
  .then((resp) => {
    const token = resp.accessToken;
    localStorage.setItem("authToken", token);
    // Redirect to dashboard
  });

// API calls (add token to headers)
fetch("/api/studies", {
  headers: { "Authorization": `Bearer ${token}` },
});
```

**Step 3: Backend Validation (API)**
```python
# FastAPI middleware
from msal import PublicClientApplication
import jwt

async def validate_token(request):
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    try:
        decoded = jwt.decode(token, options={"verify_signature": False})
        request.state.user = {
            "user_id": decoded["sub"],
            "clinic_id": decoded.get("clinic_id"),
            "sku": decoded.get("sku"),
        }
    except:
        raise HTTPException(status_code=401, detail="Invalid token")
```

**Step 4: Custom Claims in AD B2C**
- Add custom attribute: `clinic_id` (stored in B2C user directory)
- Add custom attribute: `sku` (Internal or Pilot)
- Emit these in JWT via token issuance policy

**Step 5: RLS Integration**
```sql
-- Middleware sets app.current_clinic_id from JWT
-- RLS policies read this context variable
CREATE POLICY clinic_isolation ON clinics
  FOR SELECT USING (
    id = current_setting('app.current_clinic_id')
  );
```

### Session Cleanup (from Supabase → Stateless)
- Supabase sessions: Server-managed (logout = delete session)
- Azure AD B2C: Stateless JWT (logout = clear client cache)
- **No change needed to current flow** (already stateless)

---

## 5. STORAGE: Supabase Storage → Azure Blob Storage

### Migration Strategy

**Step 1: Export from Supabase**
```bash
# List all buckets
curl -X GET 'https://your-project.supabase.co/storage/v1/bucket' \
  -H 'Authorization: Bearer YOUR_ANON_KEY'

# Download all files (using AWS S3 CLI)
aws s3 sync s3://your-supabase-bucket . --endpoint-url https://your-project.supabase.co/storage/v1/s3
```

**Step 2: Create Azure Storage Account**
```bash
az storage account create \
  --resource-group encephlian-rg \
  --name encephialstorage \
  --sku Standard_LRS \
  --kind BlobStorage \
  --access-tier Hot
```

**Step 3: Create Containers (Mirroring Supabase structure)**
```bash
az storage container create --account-name encephialstorage --name clinic-files
az storage container create --account-name encephialstorage --name eeg-signals
az storage container create --account-name encephialstorage --name reports
```

**Step 4: Upload Data**
```bash
az storage blob upload-batch \
  --account-name encephialstorage \
  --destination clinic-files \
  --source ./clinic-files
```

**Step 5: SAS Token Generation (replacing Supabase signed URLs)**
```python
# Python SDK
from azure.storage.blob import generate_blob_sas, BlobSasPermissions
from datetime import datetime, timedelta

sas_token = generate_blob_sas(
    account_name="encephialstorage",
    container_name="clinic-files",
    blob_name="clinic_123/report.pdf",
    account_key="YOUR_STORAGE_KEY",
    permission=BlobSasPermissions(read=True),
    expiry=datetime.utcnow() + timedelta(hours=1)
)

# Generate signed URL
blob_url = f"https://encephialstorage.blob.core.windows.net/clinic-files/clinic_123/report.pdf?{sas_token}"
```

### Directory Structure
```
clinic-files/
├── clinic_123/
│   ├── uploads/
│   │   ├── 2026-03-20-eeg_001.edf
│   │   └── 2026-03-21-eeg_002.edf
│   └── reports/
│       ├── report_20260320_001.pdf
│       └── report_20260321_002.pdf
│
eeg-signals/
├── TUH_CANON_001/
│   ├── canonical/
│   │   └── v1/
│   │       ├── meta.json
│   │       └── tensor.zarr/
│   └── derived/
│       ├── current.json
│       └── stats/0.1.0/{run_id}/

reports/
├── clinic_123/
│   ├── report_20260320_001.pdf
│   └── report_20260321_002.pdf
```

---

## 6. EDGE FUNCTIONS: Supabase → Azure Functions

### Function Inventory (18 functions to replace)

**HTTP Triggers (REST API):**
1. `read_api_proxy` — Proxy calls to Read API (Pilot SKU needs this)
2. `triage_runner` — Execute triage inference async
3. `report_generator` — Generate PDF reports
4. `file_upload_handler` — EEG file ingestion
5. `token_balance_check` — Verify tokens before triage
6. `clinic_onboarding` — Automation on new clinic creation

**Timer Triggers (Cron):**
7. `daily_cost_aggregation` — Summarize spend per clinic
8. `study_cleanup_old_files` — Delete files > 90 days old
9. `token_reset_monthly` — Reset trial tokens (if applicable)

**Queue/Topic Triggers (Async):**
10. `process_eeg_upload` — Async file processing after upload
11. `run_inference_async` — Async triage computation
12. `publish_triage_results` — Push results to SignalR hub

**Webhook Triggers:**
13. `razorpay_webhook_handler` — Payment verification + token credit
14. `clinic_activity_logger` — Audit log sink

**Other:**
15. `health_check` — System status
16. `debug_db_query` — Admin debugging
17. `analytics_export` — Export usage data to Data Lake
18. `ai_model_inference_webhook` — Response callback from Azure ML

### Azure Functions Implementation

**Project Structure:**
```
azure-functions/
├── read_api_proxy/
│   ├── function_app.py
│   ├── function.json
│   └── requirements.txt
├── triage_runner/
│   ├── function_app.py
│   └── ...
├── requirements.txt (shared)
├── host.json (global config)
└── local.settings.json
```

**Example: read_api_proxy**
```python
import azure.functions as func
import httpx
import os
import json

async def main(req: func.HttpRequest) -> func.HttpResponse:
    """
    Proxy to Read API (for Pilot SKU without exposed keys).
    Pilot calls this instead of calling read_api directly.
    """

    # Extract clinic from JWT
    clinic_id = req.headers.get("X-Clinic-ID")
    if not clinic_id:
        return func.HttpResponse("Missing clinic ID", status_code=401)

    # Verify token balance (check DB)
    tokens = await check_token_balance(clinic_id)
    if tokens <= 0:
        return func.HttpResponse("Insufficient tokens", status_code=402)

    # Proxy the request to Read API
    endpoint = req.params.get("endpoint")  # e.g., /studies/TUH_CANON_001/meta
    read_api_key = os.environ["READ_API_KEY"]
    read_api_url = os.environ["READ_API_URL"]

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{read_api_url}{endpoint}",
            headers={"X-API-Key": read_api_key}
        )

    # Deduct token on success
    if resp.status_code == 200:
        cost = 1  # 1 token per triage
        await deduct_token(clinic_id, cost)

    return func.HttpResponse(resp.text, status_code=resp.status_code)
```

**Example: triage_runner (Async via Queue)**
```python
import azure.functions as func
from azure.storage.queue import QueueClient

def main(req: func.HttpRequest, msg: func.Out[func.QueueMessage]) -> func.HttpResponse:
    """
    Async triage execution.
    Receives triage request, enqueues it, returns immediately with job_id.
    """

    study_id = req.json.get("study_id")
    clinic_id = req.headers.get("X-Clinic-ID")

    # Enqueue job
    job_id = str(uuid.uuid4())
    queue_message = {
        "job_id": job_id,
        "study_id": study_id,
        "clinic_id": clinic_id,
    }

    msg.set(json.dumps(queue_message))

    # Return immediately with job_id (client polls for results)
    return func.HttpResponse(
        json.dumps({"job_id": job_id}),
        status_code=202
    )

# Separate function: process_triage_async (triggered by queue message)
@app.queue_trigger(arg_name="msg", queue_name="triage-queue")
def process_triage_async(msg: func.QueueMessage):
    job = json.loads(msg.get_body().decode('utf-8'))
    # Run actual triage computation
    # Push results to SignalR hub
```

**host.json (Global Configuration):**
```json
{
  "version": "2.0",
  "logging": {
    "applicationInsights": {
      "samplingSettings": {
        "isEnabled": true,
        "maxTelemetryItemsPerSecond": 20,
        "evaluationInterval": "01:00:00",
        "samplingPercentage": 100
      }
    }
  },
  "functionTimeout": "00:05:00",
  "extensions": {
    "durableTask": {
      "tracing": {
        "traceInputsAndOutputs": true
      }
    }
  }
}
```

---

## 7. REALTIME SIGNALING: Supabase Realtime → Azure SignalR

### WebSocket Hub Setup (Azure SignalR Service)

**Why:** Supabase Realtime subscriptions → Azure SignalR for triage status updates

**Service Tier:**
- **Free tier** (1 unit, 1K concurrent users): $0 (for MVP)
- **Standard tier** (1-100 units): $1/day per unit

**Implementation:**

**1. Create SignalR Service**
```bash
az signalr create \
  --resource-group encephlian-rg \
  --name enceph-signalr \
  --sku Free_F1 \
  --unit-count 1
```

**2. Backend: Broadcast Triage Updates**
```python
# In triage_runner Azure Function or Python backend
from azure.messaging.signalrservice import SignalRConnectionInfo, HubConnectionContext

signalr_url = os.environ["SIGNALR_CONNECTION_STRING"]

# After triage completes, broadcast to clinic's triage hub
async def broadcast_triage_update(clinic_id, study_id, status):
    async with SignalRConnectionInfo(...) as conn:
        await conn.invoke("ReceiveTriageUpdate", {
            "study_id": study_id,
            "status": status,  # "processing", "completed", "error"
            "timestamp": datetime.now().isoformat(),
        })
```

**3. Frontend: Subscribe to Updates**
```typescript
import * as signalR from "@microsoft/signalr";

const connection = new signalR.HubConnectionBuilder()
  .withUrl(`${SIGNALR_URL}/hubs/triage`, {
    accessTokenFactory: () => authToken,
  })
  .withAutomaticReconnect()
  .build();

connection.on("ReceiveTriageUpdate", (update) => {
  console.log("Triage status:", update.status);
  // Update UI in real-time
  setStudyStatus(update);
});

await connection.start();
```

---

## 8. FRONTEND HOSTING: Lovable Cloud → Azure Static Web Apps

### Migration Steps

**Step 1: Build Artifacts**
```bash
cd encephlian/
npm run build  # Produces dist/
```

**Step 2: Create Static Web App**
```bash
az staticwebapp create \
  --resource-group encephlian-rg \
  --name enceph-web \
  --source https://github.com/your-org/encephlian \
  --location eastus \
  --branch main \
  --build-folder dist \
  --api-location api
```

**Step 3: Custom Domain + SSL**
```bash
az staticwebapp update \
  --name enceph-web \
  --custom-domain app.encephlian.com
```

**Step 4: Environment Variables**
- Store in Azure Key Vault (not env files)
- Reference in Static Web App configuration

```bash
az staticwebapp appsettings set \
  --name enceph-web \
  --setting-names \
    VITE_API_URL=https://api.encephlian.com \
    VITE_AUTH_CLIENT_ID=YOUR_CLIENT_ID
```

**Step 5: CI/CD Integration (GitHub Actions)**
```yaml
name: Deploy to Azure Static Web Apps

on:
  push:
    branches: [main]

jobs:
  build_and_deploy_swa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install dependencies
        run: npm install
        working-directory: encephlian

      - name: Build
        run: npm run build
        working-directory: encephlian

      - name: Deploy to Static Web Apps
        uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}
          repo_token: ${{ secrets.GITHUB_TOKEN }}
          action: "upload"
          app_location: "encephlian/dist"
          api_location: ""  # No serverless API in dist
          output_location: ""
```

---

## 9. CI/CD PIPELINE: SKU-AWARE DEPLOYMENTS

### GitHub Actions Workflow Structure

**Deployment Tracks (4 independent workflows):**

#### **9.1: Deploy Internal-Stable**
```yaml
# .github/workflows/deploy-internal-stable.yml
name: Deploy Internal-Stable

on:
  push:
    branches: [main]
    paths:
      - "encephlian-core/**"
      - ".github/workflows/deploy-internal-stable.yml"

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}/read-api-internal-stable

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      # 1. Checkout
      - uses: actions/checkout@v3

      # 2. Set up Docker Buildx
      - uses: docker/setup-buildx-action@v2

      # 3. Log in to Container Registry
      - uses: docker/login-action@v2
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      # 4. Build & Push Docker Image
      - uses: docker/build-push-action@v4
        with:
          context: encephlian-core
          file: encephlian-core/Dockerfile
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
          push: true

      # 5. Deploy to Azure Container Apps (Internal-Stable)
      - name: Deploy to Container Apps
        run: |
          az container app update \
            --name enceph-read-api-internal-stable \
            --resource-group encephlian-rg \
            --image ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            --environment-variables \
              ENCEPH_DATA_ROOT=/app/data \
              SKU=internal \
              VERSION=stable
        env:
          AZURE_CREDENTIALS: ${{ secrets.AZURE_CREDENTIALS }}
```

#### **9.2: Deploy Internal-Experimental**
Same as above, but:
- Trigger: `on: workflow_dispatch` (manual)
- Image tag: `:experimental`
- Container App: `enceph-read-api-internal-experimental`
- Environment: VERSION=experimental

#### **9.3: Deploy Pilot-Stable**
Trigger: `on: workflow_dispatch` (only after manual approval)
- Image: Same as Internal-Stable (code reuse)
- Container App: `enceph-read-api-pilot-stable`
- Environment: SKU=pilot

#### **9.4: Deploy Pilot-Experimental**
Trigger: `on: workflow_dispatch`
- Container App: `enceph-read-api-pilot-experimental`
- Environment: SKU=pilot, VERSION=experimental

### Deployment Strategy

**Blue-Green Deployments (Zero Downtime):**

1. **Internal-Stable** (prod): Keep running → Deploy to new replica → Health check → Switch traffic
2. **Pilot-Stable** (customer-facing): Same as above

**Rollback:**
```bash
# If new version has errors, revert to previous image
az container app update \
  --name enceph-read-api-internal-stable \
  --image ${{ env.REGISTRY }}/...:previous-sha
```

**Approval Gate:**
- Internal-Stable: Auto-deploy on main push
- Pilot-Stable: Manual approval (GitHub environment protection)
- Experimental: Manual trigger only

---

## 10. AUTO-SCALING CONFIGURATION

### Container Apps: CPU-Based Auto-Scaling

```terraform
# terraform/container_apps.tf

resource "azurerm_container_app_environment" "main" {
  name                           = "enceph-env"
  location                       = azurerm_resource_group.main.location
  resource_group_name            = azurerm_resource_group.main.name
  log_analytics_workspace_id     = azurerm_log_analytics_workspace.main.id
}

resource "azurerm_container_app" "internal_stable" {
  name                         = "enceph-read-api-internal-stable"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = azurerm_resource_group.main.name
  revision_mode                = "Multiple"  # For blue-green deployments

  template {
    container {
      name   = "read-api"
      image  = "ghcr.io/encephlian/read-api-internal-stable:latest"
      cpu    = 0.5  # 0.5 vCPU per replica
      memory = "1Gi"

      env {
        name  = "ENCEPH_DATA_ROOT"
        value = "/app/data"
      }
      env {
        name  = "SKU"
        value = "internal"
      }
      env {
        name  = "VERSION"
        value = "stable"
      }
    }

    scale {
      min_replicas = 1  # Always 1 running
      max_replicas = 4

      rules {
        name             = "cpu-scale-up"
        custom_rule_type = "cpu"
        cpu {
          threshold = 70
        }
        scale_direction = "Up"
        scale_amount    = 1
      }

      rules {
        name             = "cpu-scale-down"
        custom_rule_type = "cpu"
        cpu {
          threshold = 20
        }
        scale_direction = "Down"
        scale_amount    = 1
        cooldown_period = 300  # 5 minutes
      }

      rules {
        name             = "request-scale"
        custom_rule_type = "http"
        http {
          concurrent_requests = 100  # Scale if 100+ concurrent reqs
        }
        scale_direction = "Up"
        scale_amount    = 1
      }
    }
  }

  ingress {
    external_enabled = true
    target_port      = 8787
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }
}

# Monitoring: Collect metrics
resource "azurerm_monitor_metric_alert" "cpu_high" {
  name                = "HighCPU"
  resource_group_name = azurerm_resource_group.main.name
  scopes              = [azurerm_container_app.internal_stable.id]

  criteria {
    metric_name      = "CpuUsagePercentage"
    operator         = "GreaterThan"
    threshold        = 80
    aggregation      = "Average"
    metric_namespace = "Microsoft.App/containerApps"
  }

  action {
    action_group_id = azurerm_monitor_action_group.main.id
  }
}
```

### Azure Functions: Per-Execution Scaling

Azure Functions auto-scales based on queue/trigger depth:
- **HTTP Triggers:** Auto-scale based on request count
- **Timer Triggers:** Run on schedule (no scaling needed)
- **Queue Triggers:** Scale 1 instance per 1,000 queue messages

---

## 11. COST OPTIMIZATION

### Budget Allocation ($25k / year)

```
Monthly Target: ~$2,000

┌─────────────────────────────────┐
│ Compute                          │ ~$800/mo
├─────────────────────────────────┤
│ - Container Apps (4 tracks)     │ ~$600
│ - Azure Functions (18 funcs)    │ ~$50
│ - SignalR Service               │ ~$100
│ - Static Web Apps               │ ~$50
├─────────────────────────────────┤
│ Database & Storage              │ ~$400/mo
├─────────────────────────────────┤
│ - PostgreSQL (2-4 vCore)        │ ~$300
│ - Blob Storage (500GB)          │ ~$100
├─────────────────────────────────┤
│ Networking & Security           │ ~$400/mo
├─────────────────────────────────┤
│ - API Management                │ ~$200
│ - Key Vault                     │ ~$0.33 (ops only)
│ - CDN (optional)                │ ~$100
│ - Bandwidth (out)               │ ~$100
├─────────────────────────────────┤
│ Monitoring & DevOps             │ ~$300/mo
├─────────────────────────────────┤
│ - Application Insights          │ ~$100
│ - Log Analytics                 │ ~$100
│ - GitHub Actions (overages)     │ ~$50
│ - Azure DevOps (if used)        │ ~$50
├─────────────────────────────────┤
│ Reserve for emergencies         │ ~$100/mo
└─────────────────────────────────┘
TOTAL: ~$2,000/month = $24,000/year
```

### Cost Reduction Tactics

| Tactic | Savings | Implementation |
|--------|---------|-----------------|
| Reserved Instances (PostgreSQL) | 35-40% | Once patterns stabilize (Month 3+) |
| Auto-shutdown (dev resources) | $200-300/mo | Schedule turndown after 7pm |
| Spot VMs (if migrating compute) | 70-90% | Not applicable to Container Apps (no VM layer) |
| Archive storage (EEG backups > 30 days) | 80% vs hot | Move old files to Archive tier ($0.0099/GB) |
| Bandwidth optimization (CDN) | 50% | Use Azure CDN for frontend + API caching |
| Free tier components | Max out | AD B2C free events, Key Vault ops, etc. |

### Cost Monitoring

```bash
# Daily cost alert
az monitor metrics list \
  --resource /subscriptions/.../resourceGroups/encephlian-rg \
  --metric-name EstimatedCharges \
  --start-time $(date -u -d '1 day ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ)

# Budget alert (triggers at $2k/month)
az monitor metrics alert create \
  --name "Monthly Budget Alert" \
  --resource-group encephlian-rg \
  --condition "avg EstimatedCharges > 2000"
```

---

## 12. A-PLANE (ACQUISITION): OPEN-SOURCE STRATEGY

### Why Open-Source the A-Plane?

**Rationale:**
- **Vendor adapters** are domain-specific infrastructure (not competitive advantage)
- **Community contributions** accelerate support for global vendors (Philips, Natus, Nihon Kohden, GE, Masimo)
- **Ecosystem play:** You become the de-facto standard for EEG canonicalization
- **Network effects:** More vendors → more clinics → more data → better models (C+I planes)

### Repository Structure

```
encephlian-aplane (public GitHub)
├── README.md
├── CONTRIBUTING.md
├── LICENSE (Apache 2.0)
├── libs/canonical/
│   ├── vendors/
│   │   ├── edf.py (reference: Nihon Kohden EDF)
│   │   ├── natus.py (stubs)
│   │   ├── philips.py (community: PR #12)
│   │   ├── ge.py (community: PR #18)
│   │   └── masimo.py (planned)
│   └── contract/
│       └── canonical_schema_v1.json
├── tests/
│   ├── test_edf_loader.py
│   └── test_vendor_adapters.py
├── docs/
│   ├── VENDOR_ADAPTER_GUIDE.md (how to add new vendor)
│   ├── CANONICAL_CONTRACT.md
│   └── ARCHITECTURE.md
└── pyproject.toml
```

### Contribution Workflow

**Step 1: Community PR (new vendor adapter)**
```python
# contrib/natus_adapter.py (by community)
class NatusAdapter(VendorAdapter):
    """Natus EGI / Neuro Works EEG format"""

    def __init__(self, file_path):
        self.file_path = file_path

    def load_meta(self):
        """Extract metadata: channels, sampling rate, etc."""
        # Implementation
        return {...}

    def load_signals(self):
        """Load tensor as (n_channels, n_samples) float32"""
        # Implementation
        return numpy.ndarray
```

**Step 2: CI/CD Validation**
- Lint: Black, isort, mypy
- Tests: Unit tests for new adapter
- Schema validation: Output matches canonical schema
- Benchmark: Performance on sample files

**Step 3: Merge & Release**
- Tag new version (e.g., v0.3.0)
- Update docs with new vendor
- Release to PyPI

**Step 4: Federated Deployment**
- **Community users** install from PyPI
- **Your platform** redeplooys with new adapters
- **Benefits flow back** to C+I planes (more canonical data)

### Governance

**Maintainers:**
- You (initial)
- Community leads (once active contributors)

**Decision Process:**
- New vendors: Approved if tests pass + documentation complete
- Breaking changes: RFC process (GitHub discussions)
- License: Apache 2.0 (permissive, commercial-friendly)

---

## 13. MIGRATION ROADMAP: 12-WEEK PLAN

### Phase 1: Foundation (Weeks 1-3)

**Week 1:**
- [ ] Set up Azure subscription + Resource Group
- [ ] Create IaC (Terraform) structure
- [ ] Set up GitHub Actions (skeleton)
- [ ] Create Azure PostgreSQL Flexible Server

**Week 2:**
- [ ] Migrate Supabase schema to Azure PostgreSQL
- [ ] Verify RLS policies work on Azure
- [ ] Create Azure Storage Account + containers
- [ ] Set up connection pooling (PgBouncer)

**Week 3:**
- [ ] Set up Azure AD B2C tenant
- [ ] Configure OAuth 2.0 + custom claims
- [ ] Test token generation + validation
- [ ] Set up API Management (gateway)

### Phase 2: Services (Weeks 4-6)

**Week 4:**
- [ ] Create 4 Container Apps (Internal-Stable, Internal-Experimental, Pilot-Stable, Pilot-Experimental)
- [ ] Deploy existing Read API image to all 4
- [ ] Configure environment variables (SKU, VERSION)
- [ ] Test health checks + replica startup

**Week 5:**
- [ ] Create Azure Functions (18 functions)
- [ ] Implement HTTP triggers: read_api_proxy, triage_runner, report_generator
- [ ] Test integration with Container Apps
- [ ] Set up Queue Storage + triggers

**Week 6:**
- [ ] Deploy Azure SignalR Service
- [ ] Implement WebSocket hub (TriageUpdates)
- [ ] Test frontend subscription + broadcast
- [ ] Configure auto-scale rules

### Phase 3: Frontend & Deployment (Weeks 7-9)

**Week 7:**
- [ ] Create Azure Static Web Apps
- [ ] Deploy frontend build artifacts
- [ ] Update API endpoints (from Supabase to Azure)
- [ ] Configure custom domain + SSL

**Week 8:**
- [ ] Implement GitHub Actions CI/CD (4 workflows)
- [ ] Test build + deploy pipeline
- [ ] Set up blue-green deployments
- [ ] Implement rollback mechanism

**Week 9:**
- [ ] Load testing (simulate 100s of concurrent users)
- [ ] Verify auto-scaling triggers
- [ ] Test database connection pooling under load
- [ ] Document runbooks (deployment, rollback, scaling)

### Phase 4: Cutover & Optimization (Weeks 10-12)

**Week 10:**
- [ ] Set up monitoring + alerting (Azure Monitor)
- [ ] Configure cost alerts + budgets
- [ ] Run production simulation (dry run)
- [ ] Train ops team on Azure dashboards

**Week 11:**
- [ ] DNS cutover: Supabase → Azure
- [ ] Monitor for issues (24h support)
- [ ] Performance tuning (latency, throughput)
- [ ] Data validation (row counts, RLS enforcement)

**Week 12:**
- [ ] Decommission Supabase (after 1-week safety period)
- [ ] Publish A-Plane open-source
- [ ] Write migration retrospective
- [ ] Plan Phase 2 (multi-region HA, auto-scaling refinement)

---

## 14. OPERATIONS: RUNBOOKS & PLAYBOOKS

### Runbook 1: Emergency Scale-Out

**Scenario:** CPU spikes above 80%; auto-scaling slow to respond

**Steps:**
```bash
# 1. Check current replica count
az container app show --name enceph-read-api-internal-stable \
  --resource-group encephlian-rg \
  --query "template.scale.minReplicas"

# 2. Manually increase max replicas (temporary)
az container app update --name enceph-read-api-internal-stable \
  --resource-group encephlian-rg \
  --min-replicas 2 --max-replicas 8

# 3. Monitor scaling progress
az monitor metrics list \
  --resource /subscriptions/.../resourceGroups/encephlian-rg \
  --filter "ResourceType eq 'containerApps' and name.value eq 'ReplicaCount'" \
  --interval PT1M

# 4. Once stable, revert maxReplicas to 4
az container app update --name enceph-read-api-internal-stable \
  --min-replicas 1 --max-replicas 4
```

### Runbook 2: Database Connection Pool Exhaustion

**Scenario:** Connections > 100; queries slow

**Steps:**
```bash
# 1. Check pool status
psql -h pgbouncer-proxy.azurecontainers.io -U postgres -d pgbouncer -c "SHOW POOLS;"

# 2. Check active queries (long-running)
psql -h enceph-postgres-prod.postgres.database.azure.com -U postgres -d encephlian -c \
  "SELECT pid, usename, application_name, query_start, query FROM pg_stat_activity WHERE state != 'idle';"

# 3. Kill long-running queries (if safe)
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query_start < now() - interval '10 minutes';

# 4. Increase pool size (if needed)
# Edit PgBouncer config: default_pool_size = 30
# Restart: `docker restart pgbouncer-proxy`
```

### Runbook 3: Failed Triage Retry

**Scenario:** Triage function times out; retry needed

**Steps:**
```bash
# 1. Check function app logs
az functionapp log tail --name enceph-functions \
  --resource-group encephlian-rg

# 2. Check queue depth (retry backlog)
az storage queue metadata show \
  --account-name encephialstorage \
  --name triage-queue

# 3. Manually requeue failed job
az storage message put \
  --account-name encephialstorage \
  --queue-name triage-queue \
  --content "{\"job_id\": \"xyz\", \"study_id\": \"TUH_CANON_001\"}"

# 4. Monitor next execution in Application Insights
az monitor app-insights query --app enceph-insights \
  --analytics-query "customEvents | where name == 'TriageCompleted' | where properties.job_id == 'xyz'"
```

---

## 15. SECURITY & COMPLIANCE

### Network Security

**Firewall Rules:**
```terraform
# Only allow traffic from Static Web Apps, Functions, and Read API proxies
resource "azurerm_postgresql_firewall_rule" "allow_azure_services" {
  name                = "AllowAzureServices"
  resource_group_name = azurerm_resource_group.main.name
  server_name         = azurerm_postgresql_server.main.name
  start_ip_address    = "0.0.0.0"
  end_ip_address      = "0.0.0.0"  # Azure internal
}

# Deny all other traffic
resource "azurerm_postgresql_firewall_rule" "deny_all" {
  name                = "DenyAll"
  resource_group_name = azurerm_resource_group.main.name
  server_name         = azurerm_postgresql_server.main.name
  start_ip_address    = "255.255.255.255"
  end_ip_address      = "255.255.255.255"
}
```

### Secrets Management

**Azure Key Vault:**
```bash
# Store secrets
az keyvault secret set --vault-name enceph-kv \
  --name "db-connection-string" \
  --value "postgresql://user:pass@host/db"

az keyvault secret set --vault-name enceph-kv \
  --name "read-api-key" \
  --value "YOUR_API_KEY"

# Reference in Container Apps
az container app update --name enceph-read-api-internal-stable \
  --set-env-vars ENCEPH_API_KEY=keyvaultref:read-api-key
```

### Audit Logging

**Enable Audit Trail:**
```sql
-- PostgreSQL audit (pgaudit extension)
CREATE EXTENSION pgaudit;

SET pgaudit.log = 'READ,WRITE,FUNCTION';

-- All clinic activity now logged to pg_audit_log table
-- Query: SELECT * FROM pg_audit_log WHERE application_name = 'clinic_123';
```

---

## 16. SUCCESS CRITERIA & KPIs

### Infrastructure Metrics

| Metric | Target | Current |
|--------|--------|---------|
| **Uptime (Internal-Stable)** | 99.5% | TBD (post-migration) |
| **Latency (p95)** | < 200ms | TBD |
| **Error rate** | < 0.5% | TBD |
| **Cost per triage** | < $0.50 | TBD |
| **Auto-scale responsiveness** | < 2 min | TBD |

### Operational Metrics

| Metric | Target | Implementation |
|--------|--------|-----------------|
| **Deployment frequency** | 2x per week | GitHub Actions automation |
| **Lead time for changes** | < 1 day | Blue-green deployments |
| **MTTR (mean time to recover)** | < 15 min | Automated rollback + alerts |
| **On-call overhead** | < 2 hours/week | Auto-scaling + monitoring |

### Business Metrics

| Metric | Target | Note |
|--------|--------|------|
| **Pilot clinic onboarding time** | 15 min | From signup to first triage |
| **Token utilization rate** | > 80% | Clinics actually using service |
| **Triage accuracy (vs. radiologist)** | > 85% | Phase 2: fine-tuned models |
| **Cost per clinic per month** | < $200 | Sustainable GTM unit economics |

---

## 17. RISK MITIGATION

### Risk 1: Database Migration Data Loss

**Mitigation:**
- [ ] Run dry migration on staging first
- [ ] Row-count validation post-migration
- [ ] Keep Supabase backup for 30 days post-cutover
- [ ] Test RLS policies in Azure before cutover

### Risk 2: Auth Token Incompatibility

**Mitigation:**
- [ ] Parallel run: Supabase + Azure AD B2C for 1 week
- [ ] Support both token formats in API middleware
- [ ] Gradual user migration (CLI tool to refresh tokens)

### Risk 3: Performance Degradation (Azure vs. Supabase)

**Mitigation:**
- [ ] Load test before production (5000 concurrent users)
- [ ] Connection pooling (PgBouncer) to reduce latency
- [ ] CDN for static assets
- [ ] Quick rollback plan (revert DNS)

### Risk 4: Cost Overruns

**Mitigation:**
- [ ] Monthly budget alerts ($2k/mo)
- [ ] Shut down dev/test resources after 7pm
- [ ] Archive old EEG files to cheap tier
- [ ] Reserved instances once patterns stabilize

---

## 18. NEXT STEPS

**Immediate (This Week):**
1. Get Azure subscription approved (billing contact)
2. Create Resource Group + set up Terraform backend
3. Schedule sync with Azure solutions architect (free consulting)

**Short Term (This Month):**
1. Migrate PostgreSQL schema (dry run → production)
2. Set up Azure AD B2C tenant + configure OAuth
3. Deploy 4 Container Apps (test + prod environments)

**Medium Term (Q2 2026):**
1. Complete CI/CD automation (GitHub Actions)
2. Go-live on Azure (cutover from Supabase)
3. Open-source A-Plane + recruit community contributors

**Long Term (Q3-Q4 2026):**
1. Multi-region replication (disaster recovery)
2. Azure ML integration for Phase 2 triage models
3. Clinic-specific fine-tuning pipeline

---

## Appendix A: File Checklist

- [ ] `terraform/main.tf` — Resource Group, Key Vault, monitoring
- [ ] `terraform/container_apps.tf` — 4 Container Apps + auto-scaling
- [ ] `terraform/database.tf` — PostgreSQL Flexible + storage
- [ ] `terraform/functions.tf` — 18 Azure Functions
- [ ] `terraform/signalr.tf` — SignalR Service
- [ ] `terraform/monitoring.tf` — Alerts, action groups, dashboards
- [ ] `.github/workflows/deploy-internal-stable.yml` — CI/CD
- [ ] `.github/workflows/deploy-internal-experimental.yml`
- [ ] `.github/workflows/deploy-pilot-stable.yml`
- [ ] `.github/workflows/deploy-pilot-experimental.yml`
- [ ] `docker/Dockerfile` — Read API image
- [ ] `azure-functions/host.json` — Functions global config
- [ ] `azure-functions/*/function_app.py` — 18 function implementations
- [ ] `docs/AZURE_MIGRATION_CHECKLIST.md` — Week-by-week tasks
- [ ] `docs/RUNBOOKS.md` — Operational playbooks

---

**Document Version:** 1.0
**Last Updated:** March 2026
**Owner:** Hitesh (Founder)
**Status:** Ready for Implementation
