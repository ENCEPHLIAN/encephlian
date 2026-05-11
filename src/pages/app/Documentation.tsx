import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Search, Cpu, GitBranch, Database, Shield, Zap, FileCode, Activity, Server } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Section data ─────────────────────────────────────────────────────────────

const SECTIONS = [
  {
    id: "architecture",
    title: "Platform Architecture",
    icon: Server,
    tags: ["planes", "infrastructure", "overview"],
    content: [
      {
        heading: "Four-Plane Model",
        body: `The platform is structured into four functional planes, each with a single, stable responsibility:

EDGE — Supabase Edge Functions (Deno runtime). Entry point for all external requests. Handles auth, file ingestion, EDF header parsing, and routing. Stateless; no direct DB writes except pipeline event logging.

C-PLANE (Compute Plane) — Azure Container App. Receives study jobs, runs signal preprocessing (notch filter, bandpass, ICA-based artifact rejection), converts EDF/BDF to ESF (Encephlian Signal Format), and fans out model inference requests.

I-PLANE (Intelligence Plane) — Azure Container App. Hosts MIND model inference. Accepts ESF tensor inputs, returns scored annotations in SCORE format. Serves versioned model endpoints. Stateless; results are written back to Supabase by C-Plane.

READ-API — Azure Container App. Serves windowed EEG signal slices from zarr/ESF stores for the browser viewer. Handles time-range queries, downsampling, and chunk alignment.`,
      },
      {
        heading: "Service Topology",
        body: `Browser → Supabase (auth + edge functions)
             → Azure Blob (EDF storage: eeg-uploads, eeg-raw)
             → C-Plane → I-Plane → Supabase (results)
             → Read API → Browser (waveform chunks)

All inter-service calls use service-role tokens or managed identity. No external internet access from C-Plane or I-Plane.`,
      },
      {
        heading: "Autoscaling",
        body: `C-Plane: HTTP concurrency threshold 8, min 2 replicas, max 5.
I-Plane: HTTP concurrency threshold 5, min 2 replicas, max 5.
Read API: HTTP concurrency threshold 10, min 2 replicas, max 5.

Replica counts set via configure_autoscale.sh using Azure Container Apps HTTP scaling rules.`,
      },
    ],
  },
  {
    id: "pipeline",
    title: "Signal Processing Pipeline",
    icon: GitBranch,
    tags: ["edf", "esf", "mind", "preprocessing", "pipeline"],
    content: [
      {
        heading: "Ingestion",
        body: `1. Browser uploads raw EDF/BDF file to Supabase Storage (eeg-uploads bucket).
2. Edge function parse_eeg_study is invoked: reads first 64KB of EDF header only; extracts channel labels, sample rate, duration, patient identification field.
3. Patient fields (name, sex, DOB, code) are merged into studies.meta JSONB (fill-only — never overwrite existing values).
4. studies.state transitions: pending → uploaded → parsed.`,
      },
      {
        heading: "Preprocessing (C-Plane)",
        body: `On triage start, C-Plane pulls the raw EDF from Azure Blob and runs:

Signal loading: chunk-by-chunk EDF read (avoids full-file memory allocation).
Notch filter: IIR biquad at 50 or 60 Hz (configured per clinic).
Bandpass: Butterworth 0.5–70 Hz (clinical standard for routine EEG).
ICA: FastICA on first N independent components for artifact separation.
Channel quality scoring: flat-line detection, variance estimation, clipping check.

Output: ESF zarr store written to Azure Blob (canonical_eeg_records).`,
      },
      {
        heading: "Model Inference (I-Plane)",
        body: `C-Plane calls I-Plane /mind/infer with an ESF tensor slice.

MIND models:
- MIND-Triage (v2): binary classification (normal/abnormal), AUC 0.66 on TUH test set.
- MIND-Clean: artifact interval detection per channel.
- MIND-SCORE: structured annotation generation in SCORE format.
- REVE (in training): equipment-specific denoising for matched-hardware scenarios.

I-Plane returns structured JSON; C-Plane writes to studies.ai_draft_json and study_pipeline_events.`,
      },
      {
        heading: "State Machine",
        body: `studies.state (storage + workflow state):
  pending → awaiting_sla → uploaded → parsed → processing → ai_draft → in_review → signed

studies.triage_status (inference state):
  pending → processing → completed | failed

Pipeline events are written to study_pipeline_events with step, status, source, and correlation_id for end-to-end tracing.`,
      },
    ],
  },
  {
    id: "formats",
    title: "Data Formats",
    icon: FileCode,
    tags: ["esf", "score", "schema", "zarr", "json"],
    content: [
      {
        heading: "ESF — Encephlian Signal Format",
        body: `ESF is a zarr-based tensor format. Structure:

/canonical/{study_id}/
  data/         — float32 array, shape [n_channels, n_samples]
  meta.json     — { n_channels, n_samples, sampling_rate_hz, channel_map[], schema_version }
  segments.json — array of { t_start_s, t_end_s, label, score, channel_index? }
  artifacts.json — array of { start_sec, end_sec, artifact_type, channel? }

Channel map entry: { index, canonical_id, original_name, group }
Groups: frontal | central | temporal | occipital | other

ESF is immutable after creation. Reprocessing creates a new versioned record.`,
      },
      {
        heading: "SCORE Annotations",
        body: `SCORE (Standardized Computer-based Organized Reporting of EEG) annotations are stored in studies.ai_draft_json as:

{
  schema_version: "mind.report.v1",
  triage: { classification, confidence, quality_flag, quality_detail },
  score: {
    background_activity: { frequency, amplitude, symmetry, reactivity },
    sleep_features: { spindles, k_complexes, slow_waves },
    paroxysmal: { spikes, seizures },
    artifacts: []
  },
  classification: "normal" | "abnormal" | "inconclusive",
  narrative: "..."
}

All frequency values are numeric (Hz). All amplitude values are numeric (µV). No free-text fields in structured blocks — text is only in narrative.`,
      },
      {
        heading: "Artifact Schema",
        body: `Artifacts returned by MIND-Clean:

{ start_sec, end_sec, artifact_type, channel }

artifact_type values: eye_movement | muscle | electrode | electrode_noise | noisy_channel | artifact

channel is null for global artifacts (affect all channels simultaneously).
Per-channel artifacts have channel = integer index (0-based, matching ESF channel_map).

In the viewer, only global artifacts are displayed as bands. Per-channel data is available via the segment sidebar.`,
      },
    ],
  },
  {
    id: "api",
    title: "Edge Function Reference",
    icon: Zap,
    tags: ["api", "edge", "functions", "supabase"],
    content: [
      {
        heading: "create_study_from_upload",
        body: `POST — creates a study record on upload initiation.

Request: { file_name, file_type, content_sha256, clinic_id, patientMeta? }
patientMeta: { patient_name?, patient_id?, patient_sex?, patient_dob? }

Response: { study_id, upload_url }

The upload_url is a signed Supabase Storage URL for direct browser upload.`,
      },
      {
        heading: "parse_eeg_study",
        body: `POST — extracts EDF header metadata post-upload.

Request: { study_id, file_path, file_type }

Reads first 64KB only (EDF header max ~8KB). Extracts patient identification field (bytes 8–87 of EDF header):
  Format: code sex date_of_birth name (space-delimited)
  "X" = unknown for any field.

Merges extracted fields into studies.meta (fill-only). Updates studies.state → parsed, studies.srate_hz, studies.duration_min.`,
      },
      {
        heading: "generate_ai_report",
        body: `POST — triggers the full C-Plane → I-Plane triage pipeline.

Request: { study_id, sla? }

Kicks off async processing. Study state transitions via realtime subscription; poll study_pipeline_events for detailed progress.

Returns immediately with 200. Use Supabase realtime on studies table (filter: id=eq.{study_id}) to receive state updates.`,
      },
      {
        heading: "send_triage_notification",
        body: `Internal — triggered by database webhook on triage_status → completed.

Sends email to the clinic's notification address with a deep-link to the study:
  https://www.encephlian.cloud/app/studies/{study_id}

Not callable directly. Configured as a Supabase Database Webhook on studies table.`,
      },
    ],
  },
  {
    id: "security",
    title: "Security Model",
    icon: Shield,
    tags: ["rls", "security", "auth", "isolation", "jwt"],
    content: [
      {
        heading: "Row-Level Security",
        body: `All tables have RLS enabled. Core policies:

studies: SELECT/UPDATE/DELETE only if auth.uid() matches the uploader or is in the same clinic via clinic_members.
reports: SELECT if the study passes the above check; INSERT only from service role.
study_pipeline_events: INSERT from service role only; SELECT by study owner.
wallets / wallet_transactions: scoped to auth.uid() only.

Service-role key is never exposed to the browser. Edge functions use it server-side only.`,
      },
      {
        heading: "Authentication",
        body: `Supabase Auth (JWT). Session tokens have a 1-hour expiry with automatic refresh.

All edge function calls include the user's JWT in the Authorization header. The function validates the token via supabase.auth.getUser(token) before any data access.

Storage access: files in eeg-uploads and eeg-raw are not publicly readable. Downloads use signed URLs with 60-minute expiry.`,
      },
      {
        heading: "Clinic Isolation",
        body: `Clinics are isolated via the clinics table and clinic_members join table. A user can be a member of exactly one clinic (enforced by a unique constraint on clinic_members.user_id).

Studies, reports, and files are associated with a clinic_id. Cross-clinic data access is blocked at the RLS policy level, not just the application layer.`,
      },
      {
        heading: "Audit Trail",
        body: `study_pipeline_events is append-only (no UPDATE/DELETE policy for non-service role). Every significant state transition writes an event with: step, status, source, detail (JSON), correlation_id (UUIDv4, same across a triage run), created_at.

This provides a tamper-resistant audit trail for every study from upload through signature.`,
      },
    ],
  },
  {
    id: "integration",
    title: "Integration Guide",
    icon: Activity,
    tags: ["integration", "sdk", "clinic", "setup", "realtime"],
    content: [
      {
        heading: "Clinic Onboarding",
        body: `1. Admin creates a clinic record via the admin console (clinics table).
2. Admin invites users — they receive an email magic-link.
3. On first login, users are added to clinic_members.
4. SKU is set on the clinic record: 'internal' or 'pilot'.

Internal SKU: full access to all features, no token wallet.
Pilot SKU: token-gated triage, limited to one concurrent analysis.`,
      },
      {
        heading: "Realtime Subscriptions",
        body: `The browser uses Supabase Realtime (postgres_changes) for live updates.

Key subscriptions:
- studies table (UPDATE, filter: id=eq.{study_id}) → state and triage_status changes
- study_pipeline_events (INSERT, filter: study_id=eq.{study_id}) → pipeline log updates
- wallet_transactions (INSERT) → token credit notifications

Subscription channels are named per-user or per-study to prevent cross-contamination.`,
      },
      {
        heading: "Read API — Waveform Access",
        body: `The waveform viewer fetches signal chunks from the Read API:

GET {VITE_READAPI_BASE}/eeg/chunk
  ?study_id=...
  &window_start=...   (seconds from recording start)
  &window_size=...    (seconds, max 120)
  &channels=...       (optional comma-separated indices)

Returns: { signals: number[][], sampling_rate_hz, n_channels, channel_names[] }

Chunks are LRU-cached in the browser (30 entries). Prefetch: 2 windows ahead during playback.`,
      },
      {
        heading: "ESF Direct Access",
        body: `For external tooling, ESF zarr stores are accessible via Azure Blob (eeg-json and eeg-raw buckets).

Bucket structure:
  eeg-uploads/{study_id}/{filename}     — original EDF/BDF
  eeg-json/{study_id}/metadata.json     — lightweight parsed EDF metadata
  canonical/{study_id}/                 — ESF zarr store (after C-Plane processing)

Access requires a service-role Supabase Storage token or direct Azure SAS URL generated by the platform.`,
      },
    ],
  },
  {
    id: "models",
    title: "Model Reference",
    icon: Cpu,
    tags: ["mind", "model", "triage", "reve", "score", "onnx"],
    content: [
      {
        heading: "Model Inventory",
        body: `MIND-Triage (v2)
  Input: ESF tensor, 19-channel 10/20 montage, 256 Hz, 60s window
  Output: { classification: "normal"|"abnormal", confidence: float }
  Architecture: 1D-CNN + attention head
  Training: TUH Abnormal Corpus (v3.0), 10,000+ recordings
  AUC: 0.6615 on TUH test split

MIND-Clean
  Input: per-channel signal windows
  Output: artifact_type per 2-second epoch
  Classes: eye_movement, muscle, electrode, electrode_noise, noisy_channel

MIND-SCORE
  Input: preprocessed ESF
  Output: structured SCORE annotation JSON

REVE (in training)
  Input: raw EDF + equipment metadata
  Output: denoised signal for equipment-matched artifact suppression`,
      },
      {
        heading: "Model Serving",
        body: `Models are served by I-Plane as ONNX Runtime sessions. ONNX export from PyTorch training artifacts.

Versioning: I-Plane supports /mind/infer/v{N} endpoints. C-Plane always calls the latest stable version unless overridden per-study.

Model files are stored in Azure Blob (models/ container). I-Plane downloads on startup; no runtime downloads.

deploy_v2.sh performs atomic model swap: download new weights, validate, symlink, reload. No downtime.`,
      },
      {
        heading: "Training Data",
        body: `TUH Corpus usage:
  TUAB (Abnormal): binary classification training
  TUSZ (Seizure): seizure detection fine-tuning
  TUEP (Epilepsy): coming next training cycle

Data loading: custom EDF reader (no MNE dependency), streams 1GB+ files without full memory load.
Augmentation: amplitude jitter, time-shift, channel dropout.

Training runs on Azure VM (tuh-download-vm, E16as_v5, 16 vCPU, 128 GB RAM).`,
      },
    ],
  },
  {
    id: "ops",
    title: "Operations",
    icon: Database,
    tags: ["ops", "deploy", "vm", "azure", "monitoring", "health"],
    content: [
      {
        heading: "Health Endpoints",
        body: `All Container Apps expose:
  GET /health → 200 { status: "ok", version, timestamp }

C-Plane additional:
  GET /health/db → checks Supabase connectivity
  GET /health/blob → checks Azure Blob read/write

I-Plane additional:
  GET /health/model → checks ONNX session is loaded and responsive`,
      },
      {
        heading: "Deployment",
        body: `Container images are built via GitHub Actions on push to main.
Image tags: SHA-based (no :latest in production).

Deploy sequence:
  1. Build + push to Azure Container Registry
  2. az containerapp update --image {registry}/{name}:{sha}
  3. Smoke test /health endpoint
  4. Supabase edge functions: supabase functions deploy {name}

Rollback: az containerapp update to previous SHA tag.`,
      },
      {
        heading: "Azure VM (tuh-download-vm)",
        body: `E16as_v5 · 16 vCPU · 128 GB RAM · Standard_SSD
IP: 4.224.63.119

Used for: TUH corpus downloads, model training, data preprocessing.
Not in the request path — compute-only, not a service endpoint.

TUH corpus: 105k EDFs across 7 subcorpora. Stored locally on VM + mirrored to Azure Blob.`,
      },
      {
        heading: "Supabase Configuration",
        body: `Project: encephlian (prod)
Region: ap-south-1 (Mumbai)

Key tables: studies, study_files, study_pipeline_events, study_reports, reports, clinics, clinic_members, wallets, wallet_transactions, canonical_eeg_records

Realtime: enabled on studies, study_pipeline_events, wallet_transactions
Storage buckets: eeg-uploads, eeg-raw, eeg-json, eeg-reports

Edge functions deployed: parse_eeg_study, create_study_from_upload, generate_ai_report, send_triage_notification`,
      },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Documentation() {
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  const filtered = useMemo(() => {
    if (!search.trim()) return SECTIONS;
    const q = search.toLowerCase();
    return SECTIONS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.tags.some((t) => t.includes(q)) ||
        s.content.some(
          (c) =>
            c.heading.toLowerCase().includes(q) ||
            c.body.toLowerCase().includes(q)
        )
    );
  }, [search]);

  const activeSection = SECTIONS.find((s) => s.id === active);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 border-r flex flex-col overflow-hidden">
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="pl-7 h-8 text-xs"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <nav className="p-2 space-y-0.5">
            {(search ? filtered : SECTIONS).map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => { setActive(s.id); setSearch(""); }}
                  className={cn(
                    "w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left transition-colors",
                    active === s.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {s.title}
                </button>
              );
            })}
          </nav>
        </ScrollArea>
        <div className="p-3 border-t">
          <p className="text-[10px] text-muted-foreground/60 font-mono">
            ENCEPHLIAN · infra ref · v2
          </p>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="max-w-3xl mx-auto px-8 py-6 space-y-8">
            {search && filtered.length === 0 && (
              <p className="text-sm text-muted-foreground">No results for "{search}"</p>
            )}

            {(search ? filtered : activeSection ? [activeSection] : []).map((section) => {
              const Icon = section.icon;
              return (
                <div key={section.id} className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h1 className="text-lg font-semibold">{section.title}</h1>
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {section.tags.map((t) => (
                          <Badge key={t} variant="secondary" className="text-[9px] h-4 px-1.5 font-mono">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  {section.content.map((block, i) => (
                    <div key={i}>
                      <h2 className="text-sm font-semibold mb-2 text-foreground/90">{block.heading}</h2>
                      <pre className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono bg-muted/30 rounded-md p-4 border border-border/40">
                        {block.body.trim()}
                      </pre>
                      {i < section.content.length - 1 && <Separator className="mt-6 opacity-30" />}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
