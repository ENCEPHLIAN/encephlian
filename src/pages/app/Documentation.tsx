import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  BookOpen,
  Layers,
  Shield,
  Zap,
  Database,
  FileText,
  Wallet,
  Activity,
  Upload,
  Brain,
  Monitor,
  Settings,
  Users,
  Building2,
  Lock,
  Server,
  Globe,
  ChevronRight,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  Cpu,
  Download,
  FolderOpen,
  HardDrive,
  Network,
  Key,
  Eye,
  BarChart3,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSku } from "@/hooks/useSku";

// ─── Section Types ───────────────────────────────────────────────
type DocSection = {
  id: string;
  title: string;
  icon: React.ElementType;
  category: "overview" | "architecture" | "workflow" | "admin" | "security" | "migration" | "reference" | "regulatory";
  content: React.ReactNode;
  relatedSections?: string[];
  tags?: string[];
};

// ─── Cross-reference link component ─────────────────────────────
function SectionLink({ id, label }: { id: string; label: string }) {
  return (
    <button
      onClick={() => {
        const el = document.getElementById(`doc-${id}`);
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      className="inline-flex items-center gap-1 text-primary hover:underline text-sm font-medium"
    >
      {label}
      <ChevronRight className="h-3 w-3" />
    </button>
  );
}

function InfoBox({ variant = "info", children }: { variant?: "info" | "warning" | "success"; children: React.ReactNode }) {
  const styles = {
    info: "bg-blue-500/5 border-blue-500/20 text-blue-700 dark:text-blue-300",
    warning: "bg-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-300",
    success: "bg-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  };
  const icons = {
    info: Activity,
    warning: AlertTriangle,
    success: CheckCircle,
  };
  const Icon = icons[variant];
  return (
    <div className={cn("flex gap-3 p-4 rounded-lg border text-sm", styles[variant])}>
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-muted/50 border border-border/50 rounded-lg p-4 text-xs font-mono overflow-x-auto">
      {children}
    </pre>
  );
}

function Term({ children, definition }: { children: React.ReactNode; definition: string }) {
  return (
    <span className="group relative cursor-help border-b border-dotted border-muted-foreground/50">
      {children}
      <span className="absolute bottom-full left-0 mb-1 hidden group-hover:block bg-popover text-popover-foreground text-xs p-2 rounded-md shadow-lg border max-w-xs z-50">
        {definition}
      </span>
    </span>
  );
}

// ─── Section Definitions ─────────────────────────────────────────
function buildSections(): DocSection[] {
  return [
    // ═══════════════════════════════════════════════════════════════
    // OVERVIEW
    // ═══════════════════════════════════════════════════════════════
    {
      id: "platform-overview",
      title: "Platform Overview",
      icon: BookOpen,
      category: "overview",
      tags: ["introduction", "purpose", "encephlian"],
      relatedSections: ["four-plane-architecture", "sku-tiers", "study-lifecycle"],
      content: (
        <div className="space-y-4">
          <p>
            <strong>ENCEPHLIAN®</strong> is the business brand of <strong>Aposematium Private Limited</strong> (Hyderabad, est. June 2025).
            It is a clinical-grade EEG analysis Platform-as-a-Service (PaaS) 
            designed to solve the interoperability and accessibility problem for underserved neurology 
            clinics. It ingests vendor-locked EEG files, standardizes them into a canonical format, 
            runs AI-assisted triage via the <strong>MIND®</strong> (Machine Intelligence for Neural Data) algorithm family, 
            and delivers signed reports through a token-based billing system.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
              <h4 className="font-semibold text-sm mb-2">For Clinicians (Pilot)</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Upload EEG → Select SLA → Get AI triage</li>
                <li>• Review and sign reports</li>
                <li>• Token-based billing (1 token = TAT, 2 tokens = STAT)</li>
              </ul>
            </div>
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
              <h4 className="font-semibold text-sm mb-2">For Operations (Internal)</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Full lifecycle control (Lanes, Reports, Viewer)</li>
                <li>• Multi-tenant clinic management</li>
                <li>• Diagnostics, health monitoring, audit logs</li>
              </ul>
            </div>
          </div>
          <InfoBox variant="info">
            The platform supports <strong>10,000+ concurrent clinician accounts</strong> with full 
            RLS-based multi-tenant isolation. Each clinician operates as an independent, isolated unit.
          </InfoBox>
          <p className="text-sm text-muted-foreground">
            See also: <SectionLink id="four-plane-architecture" label="Four-Plane Architecture" />{" "}
            • <SectionLink id="sku-tiers" label="SKU Tiers" />{" "}
            • <SectionLink id="study-lifecycle" label="Study Lifecycle" />
          </p>
        </div>
      ),
    },

    {
      id: "corporate-product-structure",
      title: "Corporate & Product Structure",
      icon: Building2,
      category: "overview",
      tags: ["aposematium", "encephlian", "mind", "algorithm", "corporate", "brand"],
      relatedSections: ["platform-overview", "four-plane-architecture"],
      content: (
        <div className="space-y-4">
          <p>
            The platform operates across three clearly defined layers — corporate, business, and product — 
            each with distinct branding and regulatory identity.
          </p>
          <div className="space-y-3">
            {[
              {
                layer: "Corporate Layer",
                name: "Aposematium Private Limited",
                desc: "Registered entity (Hyderabad, India — June 2025). Legal manufacturer for CDSCO filings. Holds all IP, contracts, and regulatory obligations.",
                color: "border-blue-500/30 bg-blue-500/5",
              },
              {
                layer: "Business Layer (DBA)",
                name: "ENCEPHLIAN®",
                desc: "Customer-facing brand. The PaaS platform brand under which clinics, clinicians, and stakeholders interact. All product marketing, SLAs, and support run under this identity.",
                color: "border-purple-500/30 bg-purple-500/5",
              },
              {
                layer: "Product / Algorithm Layer",
                name: "MIND® — Machine Intelligence for Neural Data",
                desc: "The core AI algorithm family that powers the Inference Plane (I-Plane). Each algorithm is a discrete, versioned module with its own performance thresholds defined in ACP-001.",
                color: "border-amber-500/30 bg-amber-500/5",
              },
            ].map((l) => (
              <div key={l.layer} className={cn("p-4 rounded-lg border", l.color)}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{l.layer}</span>
                </div>
                <h4 className="font-semibold text-sm">{l.name}</h4>
                <p className="text-sm text-muted-foreground mt-1">{l.desc}</p>
              </div>
            ))}
          </div>
          <Separator />
          <h4 className="font-semibold text-sm">MIND® Algorithm Family</h4>
          <div className="grid grid-cols-2 gap-3">
            {[
              { module: "MIND®Triage", status: "Active", desc: "Priority routing and SLA-based study queuing. Determines TAT vs STAT processing order.", color: "text-emerald-500" },
              { module: "MIND®Clean", status: "Active", desc: "Artifact detection and rejection. Identifies muscle, eye-blink, electrode-pop, and environmental noise.", color: "text-emerald-500" },
              { module: "MIND®Seizure", status: "Active", desc: "Seizure pattern detection. Identifies electrographic seizure morphologies, spike-wave, and ictal patterns.", color: "text-emerald-500" },
              { module: "MIND®Score", status: "Active", desc: "Severity scoring engine. Quantifies EEG abnormality burden and generates structured severity indices.", color: "text-emerald-500" },
              { module: "MIND®Sleep", status: "R&D", desc: "Sleep staging and architecture analysis. Automated sleep stage classification for EEG sleep studies.", color: "text-amber-500" },
              { module: "MIND®Burst", status: "R&D", desc: "Burst-suppression detection and quantification. ICU and anaesthesia depth monitoring applications.", color: "text-amber-500" },
              { module: "MIND®Artifact", status: "R&D", desc: "Next-gen artifact identification and removal. Advanced source-separation beyond MIND®Clean.", color: "text-amber-500" },
              { module: "MIND®Wave", status: "R&D", desc: "Spectral decomposition and waveform morphology engine. Frequency-band power analysis and coherence mapping.", color: "text-amber-500" },
              { module: "MIND®Signature", status: "R&D", desc: "EEG biometric model. Individual neural signature extraction for patient identity verification and longitudinal tracking.", color: "text-orange-500" },
              { module: "MIND®Atlas", status: "R&D", desc: "Long-term population model. Normative EEG database for age/sex-matched comparison and epidemiological insights.", color: "text-orange-500" },
              { module: "MIND®Pilot", status: "R&D", desc: "Brain-Computer Interface (BCI) research module. Motor imagery classification and neurofeedback signal processing.", color: "text-orange-500" },
              { module: "MIND®Clinical", status: "R&D", desc: "Ambulatory EEG analysis. Optimized for long-term outpatient recordings with motion artifact resilience.", color: "text-orange-500" },
            ].map((m) => (
              <div key={m.module} className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex items-center gap-2 mb-1">
                  <Brain className="h-3.5 w-3.5 text-primary" />
                  <span className="font-semibold text-sm">{m.module}</span>
                  <Badge variant="outline" className={cn("text-[10px] ml-auto", m.color)}>{m.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{m.desc}</p>
              </div>
            ))}
          </div>
          <InfoBox variant="info">
            Each MIND® module follows the <strong>Algorithm Change Protocol (ACP-001)</strong> for versioning. 
            Category A (maintenance) and B (enhancement) updates deploy without re-registration. 
            Category C (significant change) requires a new CDSCO submission. 
            See <SectionLink id="regulatory-document-pack" label="Regulatory Document Pack" /> for ACP-001 download.
          </InfoBox>
        </div>
      ),
    },

    // ═══════════════════════════════════════════════════════════════
    // ARCHITECTURE
    // ═══════════════════════════════════════════════════════════════
    {
      id: "four-plane-architecture",
      title: "Four-Plane Architecture",
      icon: Layers,
      category: "architecture",
      tags: ["acquisition", "canonicalization", "inference", "experience", "planes"],
      relatedSections: ["platform-overview", "read-api-contract", "study-lifecycle"],
      content: (
        <div className="space-y-4">
          <p>
            ENCEPHLIAN operates across four processing planes, each with clear responsibilities 
            and clean boundaries. This separation ensures portability—each plane can be independently 
            migrated, scaled, or replaced.
          </p>
          <div className="space-y-3">
            {[
              {
                plane: "1. Acquisition Plane",
                desc: "Ingest vendor-locked EEG files (EDF, BDF, EEG). Solve the interoperability problem. Files are uploaded via the browser wizard or pushed by admin via the Windows Uploader.",
                tech: "Storage: Supabase Storage (eeg-uploads bucket) → migratable to Azure Blob",
                color: "border-blue-500/30 bg-blue-500/5",
              },
              {
                plane: "2. Canonicalization Plane (C-Plane)",
                desc: "Parse raw EEG into ENCEPHLIAN_EEG_v1 canonical schema: 27 channels, 128Hz standard, canonical JSON metadata. Boring, predictable, deterministic data.",
                tech: "Edge Function: parse_eeg_study → migratable to Azure Functions",
                color: "border-purple-500/30 bg-purple-500/5",
              },
              {
                plane: "3. Inference Plane (I-Plane) — MIND®",
                desc: "Hosts the MIND® (Machine Intelligence for Neural Data) algorithm family: MIND®Triage (priority routing), MIND®Clean (artifact rejection), MIND®Seizure (seizure detection), MIND®Score (severity scoring). R&D pipeline: MIND®Sleep, MIND®Burst, MIND®Artifact, MIND®Wave, MIND®Signature, MIND®Atlas, MIND®Pilot, MIND®Clinical. Currently uses simulated triage; production will connect to Azure ML endpoint.",
                tech: "Target: Azure ML Endpoint with $5,000 credits (expires Aug 2026)",
                color: "border-amber-500/30 bg-amber-500/5",
              },
              {
                plane: "4. Experience Plane (E-Plane)",
                desc: "Frontend PaaS for clinicians and admin. SKU-gated feature visibility. Pilot sees Upload → Triage → Report. Internal sees full Lanes, Viewer, Reports, Files, Notes.",
                tech: "React + Vite + Tailwind + shadcn/ui → fully portable static build",
                color: "border-emerald-500/30 bg-emerald-500/5",
              },
            ].map((p) => (
              <div key={p.plane} className={cn("p-4 rounded-lg border", p.color)}>
                <h4 className="font-semibold text-sm">{p.plane}</h4>
                <p className="text-sm text-muted-foreground mt-1">{p.desc}</p>
                <p className="text-xs font-mono text-muted-foreground/70 mt-2">{p.tech}</p>
              </div>
            ))}
          </div>
          <InfoBox variant="success">
            All four planes share a unified database schema but can be independently deployed. 
            The frontend (E-Plane) is a static React build with zero server coupling beyond API calls.
          </InfoBox>
          <p className="text-sm text-muted-foreground">
            See also: <SectionLink id="read-api-contract" label="Read API Contract" />{" "}
            • <SectionLink id="azure-migration" label="Azure Migration Path" />
          </p>
        </div>
      ),
    },

    {
      id: "sku-tiers",
      title: "SKU Tier System",
      icon: Layers,
      category: "architecture",
      tags: ["sku", "pilot", "internal", "feature-gating", "capabilities"],
      relatedSections: ["platform-overview", "navigation-gating"],
      content: (
        <div className="space-y-4">
          <p>
            The SKU system controls what clinicians see and can do. The backend engine is identical 
            across all tiers—only the E-Plane (frontend) changes.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Card className="border-amber-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Badge variant="secondary" className="border-amber-500/50 text-amber-600">Pilot</Badge>
                  Production Value Unit
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <p className="text-muted-foreground">What ships to real clinics. Focused, no clutter.</p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  <li>✓ Dashboard, Studies, Wallet</li>
                  <li>✓ Upload → SLA → Triage → Report</li>
                  <li>✓ Proxy-enforced API access</li>
                  <li>✗ Lanes, Viewer, Notes, Files, Templates</li>
                  <li>✗ Diagnostics, artifact overlays</li>
                </ul>
              </CardContent>
            </Card>
            <Card className="border-emerald-500/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Badge variant="outline" className="border-emerald-500/50 text-emerald-600">Internal</Badge>
                  Dev/Ops Full Access
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <p className="text-muted-foreground">Full platform for development and operations teams.</p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  <li>✓ All Pilot features</li>
                  <li>✓ Lanes (Kanban), Reports, EEG Viewer</li>
                  <li>✓ Files, Notes, Templates</li>
                  <li>✓ Direct API access (no proxy)</li>
                  <li>✓ Diagnostics, artifact overlays</li>
                </ul>
              </CardContent>
            </Card>
          </div>
          <CodeBlock>{`// Usage in components
import { useSku } from '@/hooks/useSku';

const { sku, can, isNavVisible } = useSku();

// Check capability
if (can('canRunInference')) { /* show triage button */ }

// Gate navigation
if (isNavVisible('lanes')) { /* show lanes tab */ }

// SKU is read from clinics.sku via UserSessionContext
// Admin users always get 'internal' capabilities`}</CodeBlock>
          <p className="text-sm text-muted-foreground">
            Defined in: <code className="text-xs bg-muted px-1 rounded">src/shared/skuPolicy.ts</code>{" "}
            • Hook: <code className="text-xs bg-muted px-1 rounded">src/hooks/useSku.ts</code>
          </p>
        </div>
      ),
    },

    {
      id: "session-architecture",
      title: "Session & Authentication Architecture",
      icon: Lock,
      category: "architecture",
      tags: ["auth", "session", "context", "usersession", "tfa"],
      relatedSections: ["rls-security", "role-hierarchy", "admin-routing"],
      content: (
        <div className="space-y-4">
          <p>
            <code className="bg-muted px-1 rounded text-xs">UserSessionContext</code> is the single 
            source of truth for all authentication state. It loads session, profile, clinic context, 
            and roles <strong>once</strong> on auth events and caches them.
          </p>
          <InfoBox variant="warning">
            <strong>Critical Architecture Rule:</strong> Never call <code>supabase.auth.getUser()</code> 
            directly from components. Always use <code>useUserSession()</code>. Scattered auth calls 
            caused recursive loops that froze the platform.
          </InfoBox>
          <CodeBlock>{`// ✅ Correct: Use the hook
const { user, profile, clinicContext, isAdmin, isAuthenticated } = useUserSession();

// ❌ Wrong: Direct auth call (causes recursive loops)
const { data } = await supabase.auth.getUser();`}</CodeBlock>
          <h4 className="font-semibold text-sm mt-4">What it provides:</h4>
          <ul className="text-sm space-y-1 text-muted-foreground ml-4">
            <li>• <code className="text-xs bg-muted px-1 rounded">user</code> — Supabase Auth user object</li>
            <li>• <code className="text-xs bg-muted px-1 rounded">session</code> — Full session with access_token</li>
            <li>• <code className="text-xs bg-muted px-1 rounded">profile</code> — From profiles table (name, email, credentials)</li>
            <li>• <code className="text-xs bg-muted px-1 rounded">clinicContext</code> — From user_clinic_context view (clinic_id, sku, branding)</li>
            <li>• <code className="text-xs bg-muted px-1 rounded">roles</code> — Array from user_roles table</li>
            <li>• <code className="text-xs bg-muted px-1 rounded">isAdmin</code> — true if super_admin or management</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            File: <code className="text-xs bg-muted px-1 rounded">src/contexts/UserSessionContext.tsx</code>{" "}
            • See also: <SectionLink id="rls-security" label="RLS Security" />{" "}
            • <SectionLink id="role-hierarchy" label="Role Hierarchy" />
          </p>
        </div>
      ),
    },

    // ═══════════════════════════════════════════════════════════════
    // WORKFLOW
    // ═══════════════════════════════════════════════════════════════
    {
      id: "study-lifecycle",
      title: "Study Processing Lifecycle",
      icon: Activity,
      category: "workflow",
      tags: ["study", "upload", "triage", "report", "signed", "states"],
      relatedSections: ["sla-system", "token-economy", "four-plane-architecture"],
      content: (
        <div className="space-y-4">
          <p>Every study moves through a deterministic state machine from upload to signed report.</p>
          <div className="space-y-2">
            {[
              { state: "uploaded", label: "Uploaded", desc: "File received, validated, stored in eeg-uploads/{userId}/", color: "bg-blue-500" },
              { state: "awaiting_sla", label: "Awaiting SLA", desc: "Clinician selects TAT (1 token) or STAT (2 tokens). Tokens deducted atomically.", color: "bg-amber-500" },
              { state: "processing", label: "Processing", desc: "EDF parsed → canonicalized → inference triggered. Triage progress tracked 0-100%.", color: "bg-cyan-500" },
              { state: "ai_draft", label: "AI Draft", desc: "AI-generated preliminary interpretation with pattern detection and anomaly identification.", color: "bg-purple-500" },
              { state: "in_review", label: "In Review", desc: "Board-certified clinician reviewing, editing, and refining the report.", color: "bg-orange-500" },
              { state: "signed", label: "Signed", desc: "Final report signed. Token consumed via consume_credit_and_sign(). Report PDF available.", color: "bg-emerald-500" },
            ].map((s) => (
              <div key={s.state} className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/30">
                <div className={cn("h-3 w-3 rounded-full shrink-0", s.color)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{s.label}</span>
                    <Badge variant="outline" className="text-[10px] font-mono">{s.state}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <InfoBox variant="info">
            Refund window: Clinicians can request a token refund within <strong>48 hours</strong> of 
            triage completion via <code>request_token_refund()</code>.
          </InfoBox>
          <p className="text-sm text-muted-foreground">
            See also: <SectionLink id="sla-system" label="SLA System" />{" "}
            • <SectionLink id="token-economy" label="Token Economy" />
          </p>
        </div>
      ),
    },

    {
      id: "sla-system",
      title: "SLA System (TAT & STAT)",
      icon: Clock,
      category: "workflow",
      tags: ["sla", "tat", "stat", "turnaround", "urgent"],
      relatedSections: ["study-lifecycle", "token-economy"],
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg border border-border/50 bg-muted/20">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h4 className="font-semibold text-sm">TAT — Turn Around Time</h4>
              </div>
              <p className="text-sm text-muted-foreground">Standard priority. 24-48 hour turnaround.</p>
              <Badge variant="secondary" className="mt-2">1 Token</Badge>
            </div>
            <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-amber-500" />
                <h4 className="font-semibold text-sm">STAT — Urgent Priority</h4>
              </div>
              <p className="text-sm text-muted-foreground">Immediate attention. 2-6 hour turnaround.</p>
              <Badge className="mt-2 bg-amber-500/10 text-amber-600 border-amber-500/30">2 Tokens</Badge>
            </div>
          </div>
          <InfoBox variant="warning">
            <strong>STAT designation</strong> should be reserved for true medical emergencies: 
            active seizures, status epilepticus, ICU patients, pre-surgical evaluations. 
            Overuse delays truly urgent cases.
          </InfoBox>
          <p className="text-sm text-muted-foreground">
            SLA selection triggers atomic token deduction via <code className="text-xs bg-muted px-1 rounded">select_sla_and_start_triage()</code>.
            See also: <SectionLink id="token-economy" label="Token Economy" />
          </p>
        </div>
      ),
    },

    {
      id: "token-economy",
      title: "Token Economy & Wallet",
      icon: Wallet,
      category: "workflow",
      tags: ["tokens", "wallet", "billing", "credits", "refund"],
      relatedSections: ["sla-system", "study-lifecycle", "admin-operations"],
      content: (
        <div className="space-y-4">
          <p>
            Tokens are the operational currency for clinicians. They are purchased via payment 
            integrations and consumed when selecting SLA for studies.
          </p>
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Token Flow</h4>
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
              <Badge variant="outline">Purchase</Badge>
              <ArrowRight className="h-3 w-3" />
              <Badge variant="outline">Wallet Credit</Badge>
              <ArrowRight className="h-3 w-3" />
              <Badge variant="outline">SLA Selection (Deduct)</Badge>
              <ArrowRight className="h-3 w-3" />
              <Badge variant="outline">Report Signed (Consumed)</Badge>
            </div>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Key Functions</h4>
            <ul className="text-sm space-y-1 text-muted-foreground ml-4">
              <li>• <code className="text-xs bg-muted px-1 rounded">select_sla_and_start_triage()</code> — Atomic deduction + state update</li>
              <li>• <code className="text-xs bg-muted px-1 rounded">consume_credit_and_sign()</code> — Final consumption + report creation</li>
              <li>• <code className="text-xs bg-muted px-1 rounded">request_token_refund()</code> — 48-hour refund window</li>
              <li>• <code className="text-xs bg-muted px-1 rounded">admin_adjust_tokens()</code> — Admin add/remove/set operations</li>
            </ul>
          </div>
          <InfoBox variant="info">
            All token operations use <code>FOR UPDATE</code> row locks to prevent race conditions. 
            Every transaction is logged in <code>wallet_transactions</code> with before/after balances.
          </InfoBox>
        </div>
      ),
    },

    {
      id: "eeg-upload-flow",
      title: "EEG Upload Flow",
      icon: Upload,
      category: "workflow",
      tags: ["upload", "edf", "storage", "wizard"],
      relatedSections: ["study-lifecycle", "storage-security"],
      content: (
        <div className="space-y-4">
          <p>EEG files are uploaded through a 3-step wizard or pushed by admin via the EEG Push controls.</p>
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Upload Path Requirements</h4>
            <CodeBlock>{`// Storage path MUST be prefixed with userId for RLS compliance
const filePath = \`\${userId}/\${Date.now()}-\${file.name}\`;

// RLS policy checks: (auth.uid())::text = (storage.foldername(name))[1]
// Without userId prefix → upload silently fails`}</CodeBlock>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Supported Formats</h4>
            <div className="flex gap-2">
              <Badge variant="outline">.edf</Badge>
              <Badge variant="outline">.bdf</Badge>
              <Badge variant="outline">.eeg</Badge>
            </div>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Admin Push Flow</h4>
            <p className="text-sm text-muted-foreground">
              Admins can push EEG files directly to clinician dashboards via <code className="text-xs bg-muted px-1 rounded">/admin/eeg-push</code>. 
              This bypasses the upload wizard and creates a study in <code>awaiting_sla</code> state, 
              ready for the clinician to select SLA.
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            See also: <SectionLink id="storage-security" label="Storage Security" />{" "}
            • <SectionLink id="session-architecture" label="Session Architecture" />
          </p>
        </div>
      ),
    },

    // ═══════════════════════════════════════════════════════════════
    // ADMIN
    // ═══════════════════════════════════════════════════════════════
    {
      id: "admin-operations",
      title: "Admin Operations Console",
      icon: Monitor,
      category: "admin",
      tags: ["admin", "dashboard", "operations", "console"],
      relatedSections: ["role-hierarchy", "admin-routing", "audit-logging"],
      content: (
        <div className="space-y-4">
          <p>
            The admin console at <code className="text-xs bg-muted px-1 rounded">/admin</code> provides 
            full operational control over the platform. It is strictly segregated from the PaaS 
            routes (<code>/app</code>).
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { section: "Overview", items: ["Dashboard — KPIs, pipeline health, activity feed"] },
              { section: "Value Units", items: ["Clinics — Onboard/edit/disable clinics + SKU", "Users — Manage, suspend, adjust tokens", "Wallets — Token balances + transaction history"] },
              { section: "Pipeline", items: ["Studies — All studies across clinics with state filters", "EEG Push — Push EEGs to clinician dashboards", "Read API — Diagnostics + latency benchmarks"] },
              { section: "Operations", items: ["Health — Service health checks (DB, Storage, Azure)", "Diagnostics — Read API endpoint validation", "Audit Logs — All admin actions tracked"] },
              { section: "System", items: ["Settings — Platform appearance config", "Account — Password management, security info"] },
            ].map((s) => (
              <div key={s.section} className="p-3 rounded-lg bg-muted/20 border border-border/30">
                <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider mb-1">{s.section}</h4>
                <ul className="text-xs space-y-0.5 text-muted-foreground">
                  {s.items.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            See also: <SectionLink id="role-hierarchy" label="Role Hierarchy" />{" "}
            • <SectionLink id="audit-logging" label="Audit Logging" />
          </p>
        </div>
      ),
    },

    {
      id: "admin-routing",
      title: "Admin vs PaaS Routing",
      icon: Network,
      category: "admin",
      tags: ["routing", "redirect", "protected", "guard"],
      relatedSections: ["role-hierarchy", "session-architecture"],
      content: (
        <div className="space-y-4">
          <p>Strict route segregation ensures admin and clinician paths never overlap.</p>
          <CodeBlock>{`// Route structure in App.tsx
/login              → Public login
/reset-password     → Password recovery
/admin/*            → AdminRoute guard → AdminLayout → Admin pages
/app/*              → ProtectedRoute guard → AppLayout → PaaS pages

// AdminRoute behavior:
// - Not authenticated → /login
// - Not admin (clinician) → /app/dashboard  
// - Admin without TFA → TFA gate shown
// - Admin with TFA → allow access

// ProtectedRoute behavior:
// - Not authenticated → /login
// - Admin user → redirect to /admin (prevents admin in PaaS)`}</CodeBlock>
          <InfoBox variant="warning">
            Admin routes are placed <strong>outside</strong> of ProtectedRoute in App.tsx to prevent 
            infinite redirect loops between admin and PaaS route guards.
          </InfoBox>
        </div>
      ),
    },

    // ═══════════════════════════════════════════════════════════════
    // SECURITY
    // ═══════════════════════════════════════════════════════════════
    {
      id: "role-hierarchy",
      title: "Role Hierarchy & Permissions",
      icon: Shield,
      category: "security",
      tags: ["roles", "super_admin", "management", "clinician", "permissions"],
      relatedSections: ["session-architecture", "rls-security", "admin-operations"],
      content: (
        <div className="space-y-4">
          <p>Three roles with clear boundaries. Roles are stored in the <code className="text-xs bg-muted px-1 rounded">user_roles</code> table (never on profiles).</p>
          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/5">
              <h4 className="font-semibold text-sm text-red-600 dark:text-red-400">super_admin</h4>
              <p className="text-xs text-muted-foreground mt-1">
                SQL-only creation. Can create management accounts. <strong>Invisible to management users</strong> in all interfaces. 
                Cannot be deleted. Full audit log visibility.
              </p>
            </div>
            <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/5">
              <h4 className="font-semibold text-sm text-blue-600 dark:text-blue-400">management</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Full admin for clinics/users/tokens. Cannot create other management users. 
                Cannot see super_admin accounts or their audit logs. TFA mandatory.
              </p>
            </div>
            <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
              <h4 className="font-semibold text-sm text-emerald-600 dark:text-emerald-400">clinician</h4>
              <p className="text-xs text-muted-foreground mt-1">
                PaaS end-user. Owns studies, wallet, notes. Optional self-service TFA. 
                Never sees /admin routes. Data fully isolated via RLS.
              </p>
            </div>
          </div>
          <CodeBlock>{`-- Role check function (SECURITY DEFINER, no RLS recursion)
SELECT public.has_role(auth.uid(), 'management'::app_role);

-- Admin functions validate roles internally:
IF NOT (has_role(auth.uid(), 'super_admin') OR has_role(auth.uid(), 'management')) THEN
  RAISE EXCEPTION 'Forbidden: Admin access required';
END IF;`}</CodeBlock>
        </div>
      ),
    },

    {
      id: "rls-security",
      title: "Row Level Security (RLS)",
      icon: Lock,
      category: "security",
      tags: ["rls", "policies", "isolation", "multi-tenant"],
      relatedSections: ["role-hierarchy", "storage-security", "session-architecture"],
      content: (
        <div className="space-y-4">
          <p>
            Every table has RLS enabled with <code>FORCE ROW LEVEL SECURITY</code>. 
            No data is publicly accessible. All access requires <code>auth.uid() IS NOT NULL</code>.
          </p>
          <InfoBox variant="warning">
            <strong>Critical Rule:</strong> RLS policies must NEVER reference views (especially <code>my_memberships</code>). 
            Use direct <code>clinic_memberships</code> table joins. View references caused recursive RLS loops 
            that completely froze the platform.
          </InfoBox>
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Access Patterns</h4>
            <ul className="text-sm space-y-1 text-muted-foreground ml-4">
              <li>• <strong>User-owned data</strong> (studies, notes, wallet): <code>user_id = auth.uid()</code></li>
              <li>• <strong>Clinic-scoped data</strong>: Direct join on <code>clinic_memberships</code></li>
              <li>• <strong>Admin bypass</strong>: SECURITY DEFINER functions (RPC) with internal role checks</li>
              <li>• <strong>Storage</strong>: Path-based ownership <code>(auth.uid())::text = (storage.foldername(name))[1]</code></li>
            </ul>
          </div>
          <p className="text-sm text-muted-foreground">
            See also: <SectionLink id="storage-security" label="Storage Security" />{" "}
            • <SectionLink id="role-hierarchy" label="Role Hierarchy" />
          </p>
        </div>
      ),
    },

    {
      id: "storage-security",
      title: "Storage Security & Lifecycle",
      icon: HardDrive,
      category: "security",
      tags: ["storage", "buckets", "retention", "lifecycle", "path"],
      relatedSections: ["rls-security", "eeg-upload-flow"],
      content: (
        <div className="space-y-4">
          <p>Multi-tenant storage isolation via path-based RLS on all EEG buckets.</p>
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Storage Buckets</h4>
            <div className="grid grid-cols-2 gap-2">
              {["eeg-uploads", "eeg-raw", "eeg-json", "eeg-clean", "eeg-preview", "eeg-reports", "notes", "clinic-logos"].map((b) => (
                <div key={b} className="flex items-center gap-2 p-2 rounded bg-muted/20 border border-border/30">
                  <HardDrive className="h-3 w-3 text-muted-foreground" />
                  <code className="text-xs">{b}</code>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Retention Policy</h4>
            <p className="text-sm text-muted-foreground">
              Raw EEG files (eeg-raw, eeg-uploads) have a <strong>90-day retention policy</strong>. 
              Files older than 90 days are identified via <code>get_files_for_cleanup()</code> and deleted. 
              Canonical tensors, reports, and JSON metadata are retained indefinitely.
            </p>
          </div>
          <InfoBox variant="info">
            At 10k+ users, storage grows ~20TB/month. The 90-day lifecycle policy is critical 
            for cost control (~94% gross margin target).
          </InfoBox>
        </div>
      ),
    },

    {
      id: "tfa-security",
      title: "Two-Factor Authentication",
      icon: Key,
      category: "security",
      tags: ["tfa", "2fa", "totp", "admin", "session"],
      relatedSections: ["role-hierarchy", "admin-routing"],
      content: (
        <div className="space-y-4">
          <p>Two-tier TFA model:</p>
          <ul className="text-sm space-y-2 text-muted-foreground ml-4">
            <li>
              <strong>Mandatory</strong> for super_admin and management — enforced on every session 
              via <code>AdminTFAGate</code>. 30-minute idle timeout.
            </li>
            <li>
              <strong>Optional</strong> for clinicians — self-service toggle in <code>/app/settings/tfa</code>.
            </li>
          </ul>
          <CodeBlock>{`-- TFA functions (all SECURITY DEFINER)
admin_setup_tfa(p_secret)     → Store TOTP secret
admin_verify_tfa()            → Enable + set verified_at
check_tfa_status()            → Returns { is_enabled, needs_setup }
get_tfa_secret()              → Returns secret for TOTP validation
admin_reset_user_tfa(p_user)  → Admin resets user's TFA`}</CodeBlock>
        </div>
      ),
    },

    {
      id: "audit-logging",
      title: "Audit Logging & Compliance",
      icon: Eye,
      category: "security",
      tags: ["audit", "logging", "compliance", "gdpr", "hipaa"],
      relatedSections: ["admin-operations", "role-hierarchy"],
      content: (
        <div className="space-y-4">
          <p>
            All sensitive admin actions are logged to <code className="text-xs bg-muted px-1 rounded">audit_logs</code> 
            with actor, target, timestamp, and payload.
          </p>
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Tracked Events</h4>
            <div className="flex flex-wrap gap-1">
              {[
                "user_created", "user_deleted", "user_suspended", "user_unsuspended",
                "role_granted", "admin_role_revoked", "tfa_setup_initiated", "tfa_enabled", "tfa_reset",
                "clinic_created", "clinic_updated", "clinic_deleted",
                "tokens_adjusted", "admin_study_update", "admin_delete_study",
                "admin_push_eeg", "admin_restore_to_date", "platform_setting_updated",
              ].map((e) => (
                <Badge key={e} variant="outline" className="text-[10px] font-mono">{e}</Badge>
              ))}
            </div>
          </div>
          <InfoBox variant="info">
            Management users cannot see super_admin actions or actions targeting super_admin accounts 
            in the audit log view. This enforces the invisibility constraint.
          </InfoBox>
        </div>
      ),
    },

    // ═══════════════════════════════════════════════════════════════
    // MIGRATION
    // ═══════════════════════════════════════════════════════════════
    {
      id: "azure-migration",
      title: "Azure Migration Path",
      icon: Globe,
      category: "migration",
      tags: ["azure", "migration", "portability", "supabase", "abstraction"],
      relatedSections: ["four-plane-architecture", "database-schema", "edge-functions"],
      content: (
        <div className="space-y-4">
          <p>
            ENCEPHLIAN is designed for portability. Every component has a clear abstraction boundary 
            and a direct Azure equivalent.
          </p>
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Migration Map</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Component</th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Current</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">Azure Target</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  {[
                    ["Database (PostgreSQL)", "Supabase Postgres", "Azure Database for PostgreSQL"],
                    ["Auth", "Supabase Auth (GoTrue)", "Azure AD B2C / Auth0"],
                    ["Storage", "Supabase Storage (S3)", "Azure Blob Storage"],
                    ["Edge Functions", "Supabase Edge Functions (Deno)", "Azure Functions (Node/Python)"],
                    ["Realtime", "Supabase Realtime", "Azure SignalR Service"],
                    ["RLS Policies", "PostgreSQL RLS", "PostgreSQL RLS (identical)"],
                    ["Frontend", "Vite static build", "Azure Static Web Apps"],
                    ["AI Inference", "Simulated / Read API", "Azure ML Endpoints"],
                    ["DNS/CDN", "Supabase CDN", "Azure Front Door"],
                  ].map(([component, current, target]) => (
                    <tr key={component} className="border-b border-border/30">
                      <td className="py-2 pr-4 font-medium text-foreground">{component}</td>
                      <td className="py-2 pr-4">{current}</td>
                      <td className="py-2">{target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <InfoBox variant="success">
            <strong>Key portability wins:</strong> (1) All RLS policies are standard PostgreSQL — they migrate 
            as-is. (2) Edge Functions are simple HTTP handlers — direct port to Azure Functions. 
            (3) Frontend is a static React build — deploy anywhere. (4) All Supabase SDK calls are 
            centralized in <code>src/integrations/supabase/client.ts</code> — single replacement point.
          </InfoBox>
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Abstraction Layers to Replace</h4>
            <ul className="text-sm space-y-1 text-muted-foreground ml-4">
              <li>• <code className="text-xs bg-muted px-1 rounded">supabase.from()</code> → Azure PostgreSQL client or Prisma</li>
              <li>• <code className="text-xs bg-muted px-1 rounded">supabase.storage</code> → Azure Blob SDK (<code>@azure/storage-blob</code>)</li>
              <li>• <code className="text-xs bg-muted px-1 rounded">supabase.auth</code> → Azure AD B2C / MSAL</li>
              <li>• <code className="text-xs bg-muted px-1 rounded">supabase.functions.invoke()</code> → Azure Functions HTTP client</li>
              <li>• <code className="text-xs bg-muted px-1 rounded">supabase.rpc()</code> → Direct PostgreSQL function calls</li>
            </ul>
          </div>
        </div>
      ),
    },

    // ═══════════════════════════════════════════════════════════════
    // REFERENCE
    // ═══════════════════════════════════════════════════════════════
    {
      id: "database-schema",
      title: "Database Schema Reference",
      icon: Database,
      category: "reference",
      tags: ["schema", "tables", "database", "relations"],
      relatedSections: ["rls-security", "azure-migration"],
      content: (
        <div className="space-y-4">
          <p>Core tables and their purposes:</p>
          <div className="space-y-1">
            {[
              { table: "profiles", desc: "User metadata (name, email, credentials, license). No FK to auth.users." },
              { table: "clinics", desc: "Clinic entities with SKU, branding, location. Each = 1 value unit." },
              { table: "clinic_memberships", desc: "User ↔ Clinic join table. Enforces multi-tenant isolation." },
              { table: "user_roles", desc: "Role assignments (app_role enum). Used by has_role() function." },
              { table: "studies", desc: "EEG study records with state machine, SLA, triage progress." },
              { table: "study_files", desc: "File registry (raw, upload, clean) linked to studies." },
              { table: "canonical_eeg_records", desc: "C-Plane output: canonical JSON + tensor paths." },
              { table: "reports", desc: "Final signed reports with interpreter and PDF path." },
              { table: "ai_drafts", desc: "AI-generated preliminary interpretations." },
              { table: "wallets", desc: "Token balance per user. Single row, atomic updates." },
              { table: "wallet_transactions", desc: "Immutable ledger of all token operations." },
              { table: "audit_logs", desc: "All admin actions with actor, event_type, payload." },
              { table: "tfa_secrets", desc: "TOTP secrets for 2FA. SECURITY DEFINER access only." },
              { table: "support_tickets", desc: "Customer support requests with status workflow." },
              { table: "service_health_logs", desc: "Service health check results." },
              { table: "platform_settings", desc: "Key-value config store for platform settings." },
            ].map((t) => (
              <div key={t.table} className="flex items-start gap-3 py-1.5 border-b border-border/20 last:border-0">
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono shrink-0 min-w-[180px]">{t.table}</code>
                <span className="text-xs text-muted-foreground">{t.desc}</span>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Key Views</h4>
            <ul className="text-sm space-y-1 text-muted-foreground ml-4">
              <li>• <code className="text-xs bg-muted px-1 rounded">user_clinic_context</code> — Denormalized user+clinic+role+sku for session loading</li>
              <li>• <code className="text-xs bg-muted px-1 rounded">my_memberships</code> — Current user's clinic memberships (⚠️ do NOT reference in RLS)</li>
            </ul>
          </div>
        </div>
      ),
    },

    {
      id: "edge-functions",
      title: "Edge Functions Reference",
      icon: Server,
      category: "reference",
      tags: ["functions", "edge", "api", "serverless"],
      relatedSections: ["azure-migration", "four-plane-architecture"],
      content: (
        <div className="space-y-4">
          <p>Backend functions deployed as serverless Edge Functions (Deno runtime). All auto-deploy on push.</p>
          <div className="space-y-1">
            {[
              { fn: "admin_create_user", desc: "Service-role user creation with profile + clinic assignment" },
              { fn: "admin_onboard_value_unit", desc: "Atomic clinic + clinician onboarding in one step" },
              { fn: "create_study_from_upload", desc: "Creates study record from uploaded EEG file" },
              { fn: "parse_eeg_study", desc: "C-Plane: Parse EDF → canonical schema (placeholder for real parser)" },
              { fn: "generate_ai_report", desc: "I-Plane: Generate AI draft report from canonical data" },
              { fn: "generate_report_pdf", desc: "Render signed report as downloadable PDF" },
              { fn: "sign_report", desc: "Consume token + create signed report record" },
              { fn: "create_order", desc: "Razorpay order creation for token purchase" },
              { fn: "verify_payment", desc: "Razorpay webhook verification + wallet credit" },
              { fn: "send_payment_receipt", desc: "Email receipt after successful payment" },
              { fn: "submit_support_ticket", desc: "Create ticket + email notification" },
              { fn: "send_support_email", desc: "Send support email to info@encephlian.cloud" },
              { fn: "send_triage_notification", desc: "Notify clinician when triage completes" },
              { fn: "read_api_proxy", desc: "Proxy Read API calls (injects API key server-side)" },
              { fn: "join_waitlist", desc: "Public waitlist signup" },
              { fn: "delete_account", desc: "GDPR account deletion" },
            ].map((f) => (
              <div key={f.fn} className="flex items-start gap-3 py-1.5 border-b border-border/20 last:border-0">
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono shrink-0 min-w-[220px]">{f.fn}</code>
                <span className="text-xs text-muted-foreground">{f.desc}</span>
              </div>
            ))}
          </div>
          <InfoBox variant="info">
            Edge Functions use the shared CORS handler from <code>supabase/functions/_shared/cors.ts</code>. 
            For Azure migration, each function maps to an Azure Function with HTTP trigger.
          </InfoBox>
        </div>
      ),
    },

    {
      id: "read-api-contract",
      title: "Read API Contract",
      icon: Cpu,
      category: "reference",
      tags: ["api", "readapi", "inference", "chunks", "meta"],
      relatedSections: ["four-plane-architecture", "azure-migration"],
      content: (
        <div className="space-y-4">
          <p>
            The Read API serves C-Plane and I-Plane data. Studies are identified by 
            <code className="text-xs bg-muted px-1 rounded">study_key</code> (e.g., <code>TUH_CANON_001</code>).
          </p>
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Endpoints</h4>
            <CodeBlock>{`GET  /health                                    → Service health
GET  /studies/{study_key}/meta?root=.            → Channel metadata, sample rate
GET  /studies/{study_key}/chunk.bin?start=0&len=N → Binary EEG chunk data
GET  /studies/{study_key}/artifacts?root=.        → Derived artifact annotations
GET  /studies/{study_key}/annotations?root=.      → Clinical annotations
GET  /studies/{study_key}/segments?root=.          → Segment boundaries
POST /studies/{study_key}/inference/run           → Trigger inference (returns run_id)`}</CodeBlock>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Access Modes</h4>
            <ul className="text-sm space-y-1 text-muted-foreground ml-4">
              <li>• <strong>Direct</strong> (Internal SKU): Browser → API with X-API-KEY header</li>
              <li>• <strong>Proxy</strong> (Pilot SKU): Browser → Edge Function → API (key injected server-side)</li>
            </ul>
          </div>
          <p className="text-sm text-muted-foreground">
            Config: <code className="text-xs bg-muted px-1 rounded">src/shared/readApiConfig.ts</code>{" "}
            • Client: <code className="text-xs bg-muted px-1 rounded">src/shared/readApiClient.ts</code>{" "}
            • Admin diagnostics at <code>/admin/diagnostics</code>
          </p>
        </div>
      ),
    },

    {
      id: "navigation-gating",
      title: "Navigation & Feature Gating",
      icon: Eye,
      category: "reference",
      tags: ["navigation", "gating", "skugate", "visibility"],
      relatedSections: ["sku-tiers", "session-architecture"],
      content: (
        <div className="space-y-4">
          <p>Navigation items are filtered based on the current clinic's SKU tier.</p>
          <CodeBlock>{`// AppLayout.tsx filters nav items via useSku()
const { visibleNav } = useSku();
const filteredItems = items.filter(item => visibleNav.includes(item.id));

// Pilot sees: dashboard, studies, wallet
// Internal sees: all items

// For inline feature gating:
import { SkuGate } from '@/components/sku/SkuGate';

<SkuGate capability="canViewRawWaveforms">
  <EEGViewer />
</SkuGate>`}</CodeBlock>
          <p className="text-sm text-muted-foreground">
            Components: <code className="text-xs bg-muted px-1 rounded">src/components/sku/SkuGate.tsx</code>{" "}
            • <code className="text-xs bg-muted px-1 rounded">src/components/sku/SkuBadge.tsx</code>
          </p>
        </div>
      ),
    },

    {
      id: "file-structure",
      title: "Project File Structure",
      icon: FileText,
      category: "reference",
      tags: ["files", "structure", "organization", "folders"],
      relatedSections: ["four-plane-architecture", "azure-migration"],
      content: (
        <div className="space-y-4">
          <CodeBlock>{`src/
├── admin/                    # Admin-specific components (EEG viewer, readApi)
├── components/
│   ├── admin/               # Admin layout, route guards, management UIs
│   ├── ai/                  # Anomaly detection previews
│   ├── dashboard/           # Dashboard widgets (KPIs, activity, triage)
│   ├── eeg/                 # EEG viewer components (Canvas, Controls, WebGL)
│   ├── pilot/               # Pilot SKU-specific views
│   ├── report/              # Report evidence tables, waveforms
│   ├── sku/                 # SKU badge, wallet card
│   ├── ui/                  # shadcn/ui primitives
│   └── upload/              # Study upload wizard
├── contexts/
│   └── UserSessionContext   # ★ Single source of truth for auth
├── hooks/                   # Custom hooks (useSku, useDashboardData, etc.)
├── integrations/supabase/   # Auto-generated client + types (DO NOT EDIT)
├── lib/
│   ├── ai/                  # Mock anomaly data
│   └── eeg/                 # EDF parser, montage transforms, channel groups
├── pages/
│   ├── admin/              # Admin page components
│   └── app/                # PaaS page components
├── shared/                  # Shared utilities (skuPolicy, readApiConfig)
supabase/
├── config.toml             # Supabase project config (auto-generated)
├── functions/              # Edge Functions (Deno runtime)
│   ├── _shared/cors.ts     # Shared CORS handler
│   └── */index.ts          # Individual function handlers
└── migrations/             # SQL migrations (read-only)`}</CodeBlock>
        </div>
      ),
    },

    // ═══════════════════════════════════════════════════════════════
    // REGULATORY COMPLIANCE
    // ═══════════════════════════════════════════════════════════════
    {
      id: "regulatory-overview",
      title: "Regulatory Classification & Strategy",
      icon: Shield,
      category: "regulatory",
      tags: ["cdsco", "samd", "class-b", "cdss", "mdr-2017", "regulatory"],
      relatedSections: ["audit-logging", "rls-security", "tfa-security"],
      content: (
        <div className="space-y-4">
          <p>
            ENCEPHLIAN is classified as a <strong>Class B SaMD</strong> (Software as a Medical Device) under 
            CDSCO&rsquo;s risk-based classification framework aligned with IMDRF.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
              <h4 className="font-semibold text-sm">Classification Rationale</h4>
              <ul className="text-xs space-y-1 text-muted-foreground mt-2">
                <li>&bull; Provides AI-assisted triage to <strong>support</strong> clinical decisions</li>
                <li>&bull; Does NOT autonomously diagnose or treat</li>
                <li>&bull; EEG triage is non-life-threatening clinical management</li>
                <li>&bull; Clinician always makes final diagnosis</li>
              </ul>
            </div>
            <div className="p-4 rounded-lg border border-primary/30 bg-primary/5">
              <h4 className="font-semibold text-sm">CDSS Positioning</h4>
              <ul className="text-xs space-y-1 text-muted-foreground mt-2">
                <li>&bull; Clinical Decision Support System, not diagnostic AI</li>
                <li>&bull; All reports require physician review + sign</li>
                <li>&bull; Medical disclaimer enforced on all surfaces</li>
                <li>&bull; AI draft &rarr; Review &rarr; Sign workflow preserves CDSS classification</li>
              </ul>
            </div>
          </div>
          <InfoBox variant="warning">
            <strong>Critical:</strong> If AI output ever directly suggests specific diagnoses without requiring 
            physician interpretation, the CDSS classification may be challenged and upgraded to Class C. 
            The current architecture (AI draft &rarr; physician review &rarr; sign) correctly prevents this.
          </InfoBox>
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Regulatory Authority</h4>
            <p className="text-sm text-muted-foreground">
              <strong>CDSCO</strong> (Central Drugs Standard Control Organization) under MoHFW. 
              Class B SaMD manufacturing license issued by <strong>State Licensing Authority (SLA)</strong>. 
              Registration via <strong>Sugam Portal</strong>. Estimated approval: 6&ndash;12 weeks.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "iso-13485-qms",
      title: "ISO 13485 QMS Readiness",
      icon: CheckCircle,
      category: "regulatory",
      tags: ["iso-13485", "qms", "quality", "sop", "dhf", "capa"],
      relatedSections: ["regulatory-overview", "audit-logging"],
      content: (
        <div className="space-y-4">
          <p>
            ISO 13485:2016 certification is <strong>mandatory</strong> for CDSCO Class B SaMD registration. 
            Current platform status against key clauses:
          </p>
          <div className="space-y-2">
            {[
              { clause: "4.2 Documentation", status: "partial", desc: "Architecture docs exist. Need formal Quality Manual, SOPs, Work Instructions." },
              { clause: "5.5 Management Rep", status: "gap", desc: "Appoint QMS Management Representative." },
              { clause: "7.1 Product Realization", status: "partial", desc: "Four-plane architecture documented. Need formal Design & Development Plan." },
              { clause: "7.3 Design & Development", status: "partial", desc: "Code architecture exists. Need formal DHF with design inputs/outputs/V&V." },
              { clause: "8.2 Monitoring", status: "partial", desc: "Audit logging exists. Need formal KPIs and process monitoring." },
              { clause: "8.5 CAPA", status: "gap", desc: "Need formal Corrective and Preventive Action procedure." },
            ].map((item) => (
              <div key={item.clause} className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border border-border/30">
                <div className={`h-2.5 w-2.5 rounded-full shrink-0 mt-1.5 ${item.status === 'done' ? 'bg-emerald-500' : item.status === 'partial' ? 'bg-amber-500' : 'bg-red-500'}`} />
                <div>
                  <span className="text-sm font-medium">{item.clause}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <InfoBox variant="info">
            The platform&rsquo;s existing audit trail, RLS isolation, and architecture documentation 
            significantly reduce the QMS documentation burden compared to a greenfield startup.
          </InfoBox>
        </div>
      ),
    },
    {
      id: "iec-62304-lifecycle",
      title: "IEC 62304 Software Lifecycle",
      icon: Activity,
      category: "regulatory",
      tags: ["iec-62304", "software-lifecycle", "srs", "sad", "testing", "release"],
      relatedSections: ["iso-13485-qms", "four-plane-architecture"],
      content: (
        <div className="space-y-4">
          <p>
            IEC 62304 defines software lifecycle processes for medical device software. 
            ENCEPHLIAN is classified as <strong>Class B software</strong> (could contribute to hazardous situations 
            but not directly cause serious injury).
          </p>
          <div className="space-y-2">
            {[
              { clause: "5.1 Development Planning", status: "partial", desc: "Task tracking exists. Need formal Software Development Plan." },
              { clause: "5.2 Requirements Analysis", status: "partial", desc: "Functional requirements in code/docs. Need formal SRS document." },
              { clause: "5.3 Architectural Design", status: "done", desc: "Four-plane architecture well-documented with clear plane boundaries." },
              { clause: "5.5 Integration & Testing", status: "partial", desc: "Some tests exist. Need formal test plan + traceability matrix." },
              { clause: "5.7 Software Release", status: "gap", desc: "Need formal release procedure with checklist." },
              { clause: "6.1 Maintenance Plan", status: "gap", desc: "Need post-market software maintenance SOP." },
              { clause: "8.1 Config Management", status: "partial", desc: "Git-based. Need formal CM plan with baseline management." },
            ].map((item) => (
              <div key={item.clause} className="flex items-start gap-3 p-3 rounded-lg bg-muted/20 border border-border/30">
                <div className={`h-2.5 w-2.5 rounded-full shrink-0 mt-1.5 ${item.status === 'done' ? 'bg-emerald-500' : item.status === 'partial' ? 'bg-amber-500' : 'bg-red-500'}`} />
                <div>
                  <span className="text-sm font-medium">{item.clause}</span>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: "iso-14971-risk",
      title: "ISO 14971 Risk Management",
      icon: AlertTriangle,
      category: "regulatory",
      tags: ["iso-14971", "risk", "hazard", "residual-risk", "pms"],
      relatedSections: ["regulatory-overview", "iec-62304-lifecycle"],
      content: (
        <div className="space-y-4">
          <p>
            ISO 14971:2019 requires systematic risk management throughout the product lifecycle.
          </p>
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Key Hazards to Address</h4>
            <ul className="text-sm space-y-1 text-muted-foreground ml-4">
              <li>&bull; <strong>Incorrect AI triage output</strong> &mdash; Mitigated by CDSS labeling + mandatory physician review</li>
              <li>&bull; <strong>Data integrity loss</strong> &mdash; Mitigated by RLS isolation + audit logging + atomic transactions</li>
              <li>&bull; <strong>Unauthorized access to PHI</strong> &mdash; Mitigated by multi-tenant RLS + TFA + role hierarchy</li>
              <li>&bull; <strong>System unavailability during clinical need</strong> &mdash; Monitor via service health checks</li>
              <li>&bull; <strong>EDF parsing errors producing wrong canonical data</strong> &mdash; Mitigate with validation checksums</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Existing Risk Controls</h4>
            <div className="flex flex-wrap gap-1">
              {[
                "CDSS disclaimer", "Physician sign-off gate", "RLS isolation",
                "Audit trail", "TFA for admins", "48h refund window",
                "Deterministic error handling", "Storage lifecycle policies",
              ].map((c) => (
                <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
              ))}
            </div>
          </div>
          <InfoBox variant="warning">
            <strong>Action Required:</strong> Create formal Risk Management Plan, hazard identification register, 
            probability &times; severity matrix, and residual risk assessment document.
          </InfoBox>
        </div>
      ),
    },
    {
      id: "dpdpa-cybersecurity",
      title: "DPDPA 2023 & Cybersecurity",
      icon: Lock,
      category: "regulatory",
      tags: ["dpdpa", "privacy", "cybersecurity", "iec-81001", "data-protection"],
      relatedSections: ["rls-security", "storage-security"],
      content: (
        <div className="space-y-4">
          <p>
            India&rsquo;s Digital Personal Data Protection Act, 2023 (DPDPA) applies to all health data processing. 
            IEC 81001-5-1 covers cybersecurity for health software.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg border border-border/50 bg-muted/20">
              <h4 className="font-semibold text-sm mb-2">What Exists</h4>
              <ul className="text-xs space-y-1 text-muted-foreground">
                <li className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-emerald-500" /> RLS on all 23+ tables</li>
                <li className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-emerald-500" /> TFA (TOTP) for admin access</li>
                <li className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-emerald-500" /> Encryption in transit (TLS)</li>
                <li className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-emerald-500" /> GDPR delete_account function</li>
                <li className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-emerald-500" /> Path-based storage isolation</li>
              </ul>
            </div>
            <div className="p-4 rounded-lg border border-red-500/30 bg-red-500/5">
              <h4 className="font-semibold text-sm mb-2">Gaps</h4>
              <ul className="text-xs space-y-1 text-muted-foreground">
                <li className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-500" /> Privacy policy document</li>
                <li className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-500" /> Consent management UI</li>
                <li className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-500" /> Data processing agreements</li>
                <li className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-500" /> Penetration test report</li>
                <li className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-red-500" /> Data localization assessment</li>
              </ul>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "regulatory-roadmap",
      title: "Registration Roadmap",
      icon: ArrowRight,
      category: "regulatory",
      tags: ["roadmap", "timeline", "registration", "sugam", "certification"],
      relatedSections: ["iso-13485-qms", "regulatory-overview"],
      content: (
        <div className="space-y-4">
          <p>Prioritized 5-phase plan for CDSCO Class B SaMD registration:</p>
          <div className="space-y-3">
            {[
              { phase: "Phase 1: QMS Foundation", time: "Month 1\u20132", items: "Quality Manual, Intended Use statement, Document Control SOP, CAPA procedure, Management Representative" },
              { phase: "Phase 2: Design History File", time: "Month 2\u20133", items: "Software Dev Plan (IEC 62304), SRS, Architecture Description, Traceability Matrix, V&V records" },
              { phase: "Phase 3: Risk Management", time: "Month 2\u20133", items: "Risk Management Plan (ISO 14971), Hazard analysis, Risk estimation matrix, Residual risk assessment" },
              { phase: "Phase 4: Clinical Eval & Security", time: "Month 3\u20134", items: "Clinical Evaluation Report, Cybersecurity risk assessment, Penetration testing, DPDPA documentation" },
              { phase: "Phase 5: Certification & Registration", time: "Month 4\u20136", items: "ISO 13485 audit (Stage 1+2), Algorithm Change Protocol, CDSCO Sugam Portal filing, State Mfg License" },
            ].map((p, idx) => (
              <div key={p.phase} className="flex gap-3 p-3 rounded-lg bg-muted/20 border border-border/30">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                  {idx + 1}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{p.phase}</span>
                    <Badge variant="secondary" className="text-[10px]">{p.time}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.items}</p>
                </div>
              </div>
            ))}
          </div>
          <InfoBox variant="success">
            <strong>Estimated total investment:</strong> &#x20B9;10\u201322 lakhs including ISO 13485 certification, 
            documentation, clinical evaluation, penetration testing, and CDSCO registration fees. 
            Timeline: 4\u20136 months with dedicated QMS effort.
          </InfoBox>
        </div>
      ),
    },
    // ═══════════════════════════════════════════════════════════════
    // REGULATORY DOCUMENT PACK
    // ═══════════════════════════════════════════════════════════════
    {
      id: "regulatory-document-pack",
      title: "Regulatory Document Pack",
      icon: FolderOpen,
      category: "regulatory",
      tags: ["qms", "iso-13485", "iec-62304", "iso-14971", "cdsco", "isms", "acp", "downloads"],
      relatedSections: ["iso-13485-qms", "iec-62304-lifecycle", "iso-14971-risk", "dpdpa-cybersecurity", "regulatory-roadmap"],
      content: (
        <div className="space-y-4">
          <p>
            Formal regulatory documents generated from the platform&rsquo;s actual architecture, 
            codebase, and technical controls. Each document maps real implemented features to 
            specific regulatory clauses — not placeholder content.
          </p>
          <InfoBox variant="success">
            These documents form the core of ENCEPHLIAN&rsquo;s Design History File (DHF) and 
            Quality Management System. They are living documents that should be updated as the 
            platform evolves toward MVP and post-market deployment.
          </InfoBox>
          <div className="space-y-3">
            {[
              {
                docId: "QMS-001",
                title: "Quality Manual (ISO 13485:2016)",
                desc: "QMS scope, quality policy, process mapping across four-plane architecture. Maps existing audit trails, RLS, and TFA to ISO 13485 clauses 4.1–8.5.",
                standard: "ISO 13485:2016",
                pdfUrl: "/__l5e/documents/ENCEPHLIAN_QMS-001_Quality_Manual.pdf",
                docxUrl: "/__l5e/documents/ENCEPHLIAN_QMS-001_Quality_Manual.docx",
                color: "border-blue-500/30 bg-blue-500/5",
              },
              {
                docId: "SDP-001",
                title: "Software Development Plan (IEC 62304)",
                desc: "Safety Class B rationale, SOUP inventory from package.json (React, pdfjs, mammoth, etc.), software architecture description, and unit decomposition.",
                standard: "IEC 62304:2006+A1:2015",
                pdfUrl: "/__l5e/documents/ENCEPHLIAN_SDP-001_Software_Development_Plan.pdf",
                docxUrl: "/__l5e/documents/ENCEPHLIAN_SDP-001_Software_Development_Plan.docx",
                color: "border-purple-500/30 bg-purple-500/5",
              },
              {
                docId: "RMF-001",
                title: "Risk Management File (ISO 14971)",
                desc: "12 identified hazards, 17 mitigations mapped to platform controls (RLS, CDSS disclaimers, physician sign-off gates, atomic token transactions).",
                standard: "ISO 14971:2019",
                pdfUrl: "/__l5e/documents/ENCEPHLIAN_RMF-001_Risk_Management_File.pdf",
                docxUrl: "/__l5e/documents/ENCEPHLIAN_RMF-001_Risk_Management_File.docx",
                color: "border-amber-500/30 bg-amber-500/5",
              },
              {
                docId: "TF-001",
                title: "CDSCO Technical File (Indian MDR 2017)",
                desc: "Class B SaMD classification rationale, Intended Use statement, Essential Principles checklist, and SUGAM portal submission requirements.",
                standard: "Indian MDR 2017 / CDSCO",
                pdfUrl: "/__l5e/documents/ENCEPHLIAN_TF-001_CDSCO_Technical_File.pdf",
                docxUrl: "/__l5e/documents/ENCEPHLIAN_TF-001_CDSCO_Technical_File.docx",
                color: "border-emerald-500/30 bg-emerald-500/5",
              },
              {
                docId: "ISMS-001",
                title: "Security & Privacy Framework",
                desc: "ISO 27001 Annex A control mapping, DPDPA 2023 data inventory, IEC 81001-5-1 health software security requirements, and penetration test readiness.",
                standard: "ISO 27001 / DPDPA 2023 / IEC 81001-5-1",
                pdfUrl: "/__l5e/documents/ENCEPHLIAN_ISMS-001_Security_Privacy_Framework.pdf",
                docxUrl: "/__l5e/documents/ENCEPHLIAN_ISMS-001_Security_Privacy_Framework.docx",
                color: "border-red-500/30 bg-red-500/5",
              },
              {
                docId: "ACP-001",
                title: "Algorithm Change Protocol",
                desc: "Three-tier change classification (Cat A/B/C), performance thresholds for AI model updates, PCCP-style boundary conditions, and annual PSUR reporting format.",
                standard: "CDSCO Oct 2025 Draft / IMDRF N67 / FDA PCCP",
                pdfUrl: "/__l5e/documents/ENCEPHLIAN_ACP-001_Algorithm_Change_Protocol.pdf",
                docxUrl: "/__l5e/documents/ENCEPHLIAN_ACP-001_Algorithm_Change_Protocol.docx",
                color: "border-cyan-500/30 bg-cyan-500/5",
              },
            ].map((doc) => (
              <div key={doc.docId} className={cn("p-4 rounded-lg border", doc.color)}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px] font-mono shrink-0">{doc.docId}</Badge>
                      <h4 className="font-semibold text-sm truncate">{doc.title}</h4>
                    </div>
                    <p className="text-xs text-muted-foreground">{doc.desc}</p>
                    <p className="text-[10px] font-mono text-muted-foreground/60 mt-1">Standard: {doc.standard}</p>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <a href={doc.pdfUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="h-7 text-xs w-full gap-1.5">
                        <Download className="h-3 w-3" />
                        PDF
                      </Button>
                    </a>
                    <a href={doc.docxUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="ghost" size="sm" className="h-7 text-xs w-full gap-1.5">
                        <Download className="h-3 w-3" />
                        DOCX
                      </Button>
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <InfoBox variant="warning">
            <strong>Document Lifecycle:</strong> These documents should be version-controlled under 
            formal Document Control (QMS-001 §4.2). Update revision history, obtain QMS Management 
            Representative approval, and re-issue when the platform architecture or risk profile changes materially.
          </InfoBox>
          <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
            <h4 className="font-semibold text-sm mb-2">Gap Analysis Report</h4>
            <p className="text-xs text-muted-foreground mb-2">
              Comprehensive gap analysis covering Indian MDR 2017, CDSCO requirements, ISO 13485, 
              IEC 62304, ISO 14971, ISO 27001, and DPDPA 2023 compliance status.
            </p>
            <div className="flex gap-2">
              <a href="/__l5e/documents/ENCEPHLIAN_Regulatory_Gap_Analysis.pdf" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                  <Download className="h-3 w-3" />
                  Gap Analysis (PDF)
                </Button>
              </a>
              <a href="/__l5e/documents/ENCEPHLIAN_Regulatory_Gap_Analysis.docx" target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5">
                  <Download className="h-3 w-3" />
                  Gap Analysis (DOCX)
                </Button>
              </a>
            </div>
          </div>
        </div>
      ),
    },
  ];
}

// ─── Category Labels ─────────────────────────────────────────────
const CATEGORY_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  overview: { label: "Overview", icon: BookOpen },
  architecture: { label: "Architecture", icon: Layers },
  workflow: { label: "Workflows", icon: Activity },
  admin: { label: "Admin Console", icon: Monitor },
  security: { label: "Security", icon: Shield },
  regulatory: { label: "Regulatory Compliance", icon: Shield },
  migration: { label: "Migration", icon: Globe },
  reference: { label: "Reference", icon: Database },
};

// ─── Main Component ──────────────────────────────────────────────
export default function Documentation() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const { sku } = useSku();

  const sections = useMemo(() => buildSections(), []);

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections;
    const query = searchQuery.toLowerCase();
    return sections.filter(
      (s) =>
        s.title.toLowerCase().includes(query) ||
        s.tags?.some((t) => t.includes(query)) ||
        s.id.includes(query)
    );
  }, [sections, searchQuery]);

  const categories = useMemo(() => {
    const cats = new Map<string, DocSection[]>();
    for (const s of filteredSections) {
      if (!cats.has(s.category)) cats.set(s.category, []);
      cats.get(s.category)!.push(s);
    }
    return cats;
  }, [filteredSections]);

  return (
    <div className="flex gap-6 max-w-7xl">
      {/* Sidebar TOC */}
      <aside className="hidden lg:block w-56 shrink-0 sticky top-20 h-[calc(100vh-6rem)]">
        <ScrollArea className="h-full pr-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Documentation</h2>
            </div>
            {Object.entries(CATEGORY_LABELS).map(([key, { label, icon: Icon }]) => {
              const catSections = sections.filter((s) => s.category === key);
              if (catSections.length === 0) return null;
              return (
                <div key={key}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</span>
                  </div>
                  <div className="space-y-0.5 ml-4">
                    {catSections.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setActiveSection(s.id);
                          document.getElementById(`doc-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className={cn(
                          "block w-full text-left text-xs py-1 px-2 rounded transition-colors",
                          activeSection === s.id
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                        )}
                      >
                        {s.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">ENCEPHLIAN® Platform Manual</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Aposematium Pvt. Ltd. — Comprehensive platform documentation — v1.0
            </p>
          </div>
          <Badge variant="outline" className="text-xs font-mono">
            {sku.toUpperCase()} SKU
          </Badge>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documentation..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Sections */}
        {Array.from(categories.entries()).map(([category, categorySections]) => {
          const { label, icon: CatIcon } = CATEGORY_LABELS[category] || { label: category, icon: BookOpen };
          return (
            <div key={category} className="space-y-4">
              <div className="flex items-center gap-2 pt-4">
                <CatIcon className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/70">{label}</h2>
                <Separator className="flex-1" />
              </div>
              {categorySections.map((section) => (
                <Card key={section.id} id={`doc-${section.id}`} className="scroll-mt-20">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <section.icon className="h-4 w-4 text-muted-foreground" />
                      <CardTitle className="text-base">{section.title}</CardTitle>
                    </div>
                    {section.tags && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {section.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px] font-mono">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>{section.content}</CardContent>
                  {section.relatedSections && section.relatedSections.length > 0 && (
                    <div className="px-6 pb-4 pt-2 border-t border-border/30">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">Related:</span>
                        {section.relatedSections.map((id) => {
                          const related = sections.find((s) => s.id === id);
                          return related ? (
                            <SectionLink key={id} id={id} label={related.title} />
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          );
        })}

        {filteredSections.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No documentation found for "{searchQuery}"</p>
          </div>
        )}
      </div>
    </div>
  );
}
