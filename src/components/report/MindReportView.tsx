/**
 * MindReportView — renders the blob-native MIND® report produced by
 * I-Plane's POST /mind/run/{study_id} endpoint.
 *
 * Report schema (mind.report.v1):
 *   triage:  { classification, confidence, model, icd_hint? }
 *   clean:   { clean_percentage, artifact_windows, total_windows, artifacts[], model }
 *   seizure: { events[], model }
 *   score:   { recording_conditions, background_activity, interictal_findings,
 *              ictal_findings, technical_issues, impression, clinical_significance,
 *              clinical_significance_label, recommended_action, icd_hint,
 *              recording_quality, interpretable_percentage, duration_seconds, summary }
 *   recording: derived_meta from C-Plane
 */
import { useNavigate, Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Activity, Brain, Shield, Zap, Clock, AlertCircle,
  CheckCircle2, Info, ExternalLink, Waves, FileText,
} from "lucide-react";

interface MindReportViewProps {
  report: any;
  studyId?: string;
}

const SIGNIFICANCE_COLOR: Record<string, string> = {
  normal:               "bg-emerald-500 text-white",
  mildly_abnormal:      "bg-amber-400 text-black",
  moderately_abnormal:  "bg-orange-500 text-white",
  markedly_abnormal:    "bg-destructive text-destructive-foreground",
};

export default function MindReportView({ report, studyId }: MindReportViewProps) {
  const navigate = useNavigate();

  if (!report) return null;

  const triage  = report.triage  || {};
  const clean   = report.clean   || {};
  const seizure = report.seizure || {};
  const score   = report.score   || {};
  const rec     = report.recording || {};

  const classification = triage.classification || "unknown";
  const confidence     = typeof triage.confidence === "number" ? triage.confidence : null;
  const isAbnormal     = classification === "abnormal";
  const cleanPct       = typeof clean.clean_percentage === "number" ? clean.clean_percentage : null;
  const artifacts      = Array.isArray(clean.artifacts) ? clean.artifacts : [];
  const seizureEvents  = Array.isArray(seizure.events) ? seizure.events : [];
  const quality        = score.recording_quality || rec.quality_grade;
  const durationSec    = score.duration_seconds || rec.duration_seconds || 0;
  const durationMin    = durationSec ? Math.round(durationSec / 60) : null;

  // SCORE EEG structured fields
  // score.background_activity may be flat (from _build_score) or nested (from libs.score)
  const _bgRaw         = score.background_activity || {};
  const _bgPdr         = (_bgRaw as any).pdr || (_bgRaw as any).posterior_dominant_rhythm || {};
  const bg: Record<string, any> = {
    pdr_frequency_hz: _bgRaw.pdr_frequency_hz ?? _bgPdr.frequency_hz ?? null,
    pdr_normal:       _bgRaw.pdr_normal ?? _bgPdr.within_normal_limits ?? _bgPdr.within_normal_limits ?? null,
    continuity:       _bgRaw.continuity ?? _bgRaw.background_continuity ?? null,
    symmetry:         _bgRaw.symmetry ?? _bgPdr.symmetry ?? null,
    reactivity:       _bgRaw.reactivity ?? _bgPdr.reactivity ?? null,
    generalized_slowing: _bgRaw.generalized_slowing ?? null,
    interhemispheric_asymmetry: _bgRaw.interhemispheric_asymmetry ?? null,
  };
  const sigKey         = score.clinical_significance as string | undefined;
  const sigLabel       = score.clinical_significance_label as string | undefined;
  const sigColor       = sigKey ? (SIGNIFICANCE_COLOR[sigKey] ?? "bg-muted text-foreground") : null;
  // impression may be a string (flat) or {text:string,...} (dataclass serialization)
  const _impRaw        = score.impression;
  const impression     = typeof _impRaw === "object" && _impRaw !== null
    ? (_impRaw as any).text as string | undefined
    : _impRaw as string | undefined;
  const icdHint        = triage.icd_hint || score.icd_hint as string | undefined;
  const ictNote        = score.ictal_findings?.note as string | undefined;
  const iiedsNote      = score.interictal_findings?.ieds_note as string | undefined;
  // generalized_slowing may be an object {present, grade} or a string
  const genSlowing     = bg.generalized_slowing;
  const genSlowingStr  = genSlowing
    ? (typeof genSlowing === "object"
        ? (genSlowing.present ? genSlowing.grade ?? "present" : "none")
        : String(genSlowing))
    : undefined;

  const goToArtifact = (a: any) => {
    if (!studyId) return;
    const p = new URLSearchParams({
      studyId,
      t: String(a.start_sec ?? 0),
      t_end: String(a.end_sec ?? (Number(a.start_sec ?? 0) + 2)),
      focus: "segment",
      label: "artifact",
    });
    navigate(`/app/eeg-viewer?${p}`);
  };

  const goToSeizure = (e: any) => {
    if (!studyId) return;
    const p = new URLSearchParams({
      studyId,
      t: String(e.onset_time ?? 0),
      t_end: String(e.offset_time ?? (Number(e.onset_time ?? 0) + 10)),
      focus: "segment",
      label: "seizure",
    });
    if (e.confidence != null) p.set("score", String(e.confidence));
    navigate(`/app/eeg-viewer?${p}`);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-mono text-muted-foreground">
            {report.pipeline_version ? `MIND® Pipeline v${report.pipeline_version}` : "MIND® Pipeline v1.0"}
            {" · "}schema {report.schema_version || "mind.report.v1"}
          </p>
          <div className="flex items-center gap-2">
            {studyId && (
              <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1" asChild>
                <Link to={`/app/eeg-viewer?studyId=${studyId}`}>
                  <Activity className="h-2.5 w-2.5" />
                  Viewer
                </Link>
              </Button>
            )}
            <Badge variant="outline" className="text-[9px] gap-1">
              <Shield className="h-2.5 w-2.5" />
              ONNX Inference
            </Badge>
            <Badge variant="outline" className="text-[9px] gap-1">
              <FileText className="h-2.5 w-2.5" />
              SCORE EEG v1
            </Badge>
          </div>
        </div>
        <Separator />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <div>
            <p className="text-muted-foreground">Channels</p>
            <p className="font-medium font-mono">{rec.n_channels ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Sample Rate</p>
            <p className="font-medium font-mono">{rec.sampling_rate_hz ?? "—"} Hz</p>
          </div>
          <div>
            <p className="text-muted-foreground">Duration</p>
            <p className="font-medium font-mono">{durationMin != null ? `${durationMin} min` : "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Quality</p>
            <p className="font-medium font-mono">{quality ?? "—"}</p>
          </div>
        </div>
      </div>

      {report.inference && (
        <details className="rounded-lg border bg-muted/20 text-xs">
          <summary className="cursor-pointer px-3 py-2 font-medium text-foreground">
            Inference provenance (models and roadmap)
          </summary>
          <pre className="px-3 pb-3 overflow-x-auto text-[10px] font-mono whitespace-pre-wrap text-muted-foreground">
            {JSON.stringify(report.inference, null, 2)}
          </pre>
        </details>
      )}

      {/* MIND®Triage + SCORE clinical significance */}
      <div className={`rounded-lg border-2 p-4 ${isAbnormal ? "border-destructive/40 bg-destructive/5" : "border-emerald-500/40 bg-emerald-500/5"}`}>
        <div className="flex items-center gap-3">
          <Brain className={`h-6 w-6 ${isAbnormal ? "text-destructive" : "text-emerald-500"}`} />
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold uppercase tracking-wide">MIND®Triage</p>
              <Badge
                className={isAbnormal
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-emerald-500 text-white"}
              >
                {classification.toUpperCase()}
              </Badge>
              {sigLabel && sigColor && (
                <Badge className={`text-[9px] ${sigColor}`}>
                  {sigLabel}
                </Badge>
              )}
              {icdHint && (
                <span className="text-[9px] font-mono text-muted-foreground">{icdHint}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Model: {triage.model || "mind_triage_v1"}
              {confidence != null && ` · confidence ${(confidence * 100).toFixed(0)}%`}
            </p>
          </div>
          {confidence != null && (
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold tabular-nums font-mono">
                {(confidence * 100).toFixed(0)}
                <span className="text-sm font-normal">%</span>
              </p>
              <p className="text-[10px] text-muted-foreground">confidence</p>
            </div>
          )}
        </div>
        {confidence != null && (
          <div className="mt-3 space-y-1">
            <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${isAbnormal ? "bg-destructive" : "bg-emerald-500"}`}
                style={{ width: `${confidence * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Key Indicators */}
      {(() => {
        type Sev = "critical" | "warn" | "good" | "info";
        const items: Array<{ icon: (props: { className?: string }) => JSX.Element | null; label: string; sev: Sev }> = [];
        if (seizureEvents.length > 0)
          items.push({ icon: Zap, label: `${seizureEvents.length} seizure event${seizureEvents.length !== 1 ? "s" : ""} detected`, sev: "critical" });
        if (cleanPct != null && cleanPct < 70)
          items.push({ icon: Activity, label: `${(100 - cleanPct).toFixed(0)}% artifact contamination (${cleanPct.toFixed(0)}% clean)`, sev: "warn" });
        if (genSlowingStr && genSlowingStr !== "none")
          items.push({ icon: Waves, label: `Generalized slowing: ${genSlowingStr}`, sev: "warn" });
        if (bg.symmetry === "asymmetric")
          items.push({ icon: AlertCircle, label: "Interhemispheric asymmetry detected", sev: "warn" });
        if (bg.pdr_normal === false)
          items.push({ icon: AlertCircle, label: `PDR below normal range${bg.pdr_frequency_hz ? ` (${bg.pdr_frequency_hz} Hz)` : ""}`, sev: "warn" });
        if (cleanPct != null && cleanPct >= 70)
          items.push({ icon: CheckCircle2, label: `${cleanPct.toFixed(0)}% clean recording`, sev: "good" });
        if (bg.pdr_normal === true)
          items.push({ icon: CheckCircle2, label: `PDR within normal range (${bg.pdr_frequency_hz} Hz)`, sev: "good" });
        if (seizureEvents.length === 0 && cleanPct != null)
          items.push({ icon: CheckCircle2, label: "No seizure activity detected", sev: "good" });
        if (items.length === 0) return null;
        const CFG: Record<Sev, string> = {
          critical: "bg-destructive/10 text-destructive",
          warn:     "bg-amber-500/10 text-amber-700 dark:text-amber-400",
          good:     "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
          info:     "bg-muted/40 text-muted-foreground",
        };
        return (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
              <h3 className="text-xs font-medium">Key Indicators</h3>
              <span className="text-[9px] text-muted-foreground ml-auto">contributing factors</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {items.map((item, i) => {
                const Icon = item.icon;
                return (
                  <div key={i} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs ${CFG[item.sev]}`}>
                    <Icon className="h-3 w-3 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* SCORE EEG — Background Activity */}
      {(bg.pdr_frequency_hz || bg.continuity || bg.symmetry || bg.generalized_slowing) && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Waves className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-medium">Background Activity</h3>
            <span className="text-[9px] text-muted-foreground ml-auto">SCORE EEG §3</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {bg.pdr_frequency_hz != null && (
              <ScoreField
                label="PDR"
                value={`${bg.pdr_frequency_hz} Hz`}
                sub={bg.pdr_normal === false ? "below normal" : bg.pdr_normal === true ? "normal range" : undefined}
                highlight={bg.pdr_normal === true}
                warn={bg.pdr_normal === false}
              />
            )}
            {bg.continuity && (
              <ScoreField label="Continuity" value={bg.continuity} />
            )}
            {bg.symmetry && (
              <ScoreField
                label="Symmetry"
                value={bg.symmetry}
                warn={bg.symmetry === "asymmetric"}
              />
            )}
            {bg.reactivity && (
              <ScoreField label="Reactivity" value={bg.reactivity} />
            )}
            {genSlowingStr && (
              <ScoreField
                label="Gen. Slowing"
                value={genSlowingStr}
                warn={genSlowingStr !== "none"}
              />
            )}
            {bg.interhemispheric_asymmetry != null && (
              <ScoreField
                label="Asymmetry idx"
                value={`${(bg.interhemispheric_asymmetry * 100).toFixed(0)}%`}
                warn={bg.interhemispheric_asymmetry > 0.20}
              />
            )}
          </div>
        </div>
      )}

      {/* MIND®Clean */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-xs font-medium">MIND®Clean — Artifact Detection</h3>
          <Badge variant="outline" className="text-[9px] ml-auto">{clean.model || "mind_clean_v1"}</Badge>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <MiniMetric
            label="Clean"
            value={cleanPct != null ? `${cleanPct.toFixed(1)}%` : "—"}
            highlight={cleanPct != null && cleanPct >= 70}
          />
          <MiniMetric
            label="Artifact windows"
            value={String(clean.artifact_windows ?? "—")}
          />
          <MiniMetric
            label="Total windows"
            value={String(clean.total_windows ?? "—")}
          />
        </div>

        {/* Artifact timeline bar — clickable */}
        {artifacts.length > 0 && durationSec > 0 && (
          <div className="space-y-1">
            <p className="text-[9px] text-muted-foreground font-mono">
              0:00 ──────────────────────────────── {Math.floor(durationSec / 60)}:{String(Math.floor(durationSec % 60)).padStart(2, "0")}
            </p>
            <div className="relative h-3 bg-muted rounded-sm overflow-hidden">
              {artifacts.slice(0, 100).map((a: any, i: number) => (
                <button
                  key={i}
                  onClick={() => goToArtifact(a)}
                  disabled={!studyId}
                  className="absolute top-0 h-full bg-red-500/50 hover:bg-red-500/80 transition-colors disabled:cursor-default"
                  style={{
                    left: `${(a.start_sec / durationSec) * 100}%`,
                    width: `${Math.max(0.3, ((a.end_sec - a.start_sec) / durationSec) * 100)}%`,
                  }}
                  title={`${a.start_sec}s–${a.end_sec}s · ${a.severity}`}
                />
              ))}
            </div>
            {studyId && (
              <p className="text-[9px] text-muted-foreground px-1">
                click any segment to review in EEG Viewer
              </p>
            )}
          </div>
        )}

        {/* Artifact table */}
        {artifacts.length > 0 && (
          <details className="group">
            <summary className="flex items-center gap-2 cursor-pointer text-xs font-medium py-1 select-none text-muted-foreground hover:text-foreground transition-colors">
              <AlertCircle className="h-3.5 w-3.5" />
              {artifacts.length} artifact window{artifacts.length !== 1 ? "s" : ""}
              {studyId && <span className="text-[9px] ml-auto">click to view</span>}
            </summary>
            <div className="mt-1.5 rounded-lg border overflow-hidden">
              <div className="grid grid-cols-[2.5rem_3.5rem_3.5rem_1fr_3rem_1.5rem] gap-1 p-1.5 bg-muted/50 text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                <span>#</span>
                <span>Start</span>
                <span>End</span>
                <span>Type</span>
                <span>Prob</span>
                <span></span>
              </div>
              {artifacts.slice(0, 20).map((a: any, i: number) => {
                const typeColor: Record<string, string> = {
                  eye_movement:    "text-violet-500",
                  muscle:          "text-orange-500",
                  electrode_noise: "text-yellow-600",
                  artifact:        "text-muted-foreground",
                };
                const tc = typeColor[a.artifact_type ?? "artifact"] ?? "text-muted-foreground";
                return (
                  <button
                    key={i}
                    onClick={() => goToArtifact(a)}
                    disabled={!studyId}
                    className="grid grid-cols-[2.5rem_3.5rem_3.5rem_1fr_3rem_1.5rem] gap-1 p-1.5 text-[11px] border-t w-full text-left hover:bg-primary/5 disabled:hover:bg-transparent transition-colors group"
                  >
                    <span className="font-mono text-muted-foreground">#{a.window_idx ?? i}</span>
                    <span className="font-mono">{a.start_sec != null ? `${a.start_sec}s` : "—"}</span>
                    <span className="font-mono">{a.end_sec != null ? `${a.end_sec}s` : "—"}</span>
                    <span className={`font-medium ${tc}`}>
                      {(a.artifact_type ?? a.severity ?? "artifact").replace(/_/g, " ")}
                    </span>
                    <span className="font-mono text-[10px]">
                      {a.artifact_probability != null ? (a.artifact_probability * 100).toFixed(0) + "%" : "—"}
                    </span>
                    {studyId && (
                      <ExternalLink className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity self-center" />
                    )}
                  </button>
                );
              })}
              {artifacts.length > 20 && (
                <p className="text-center text-[10px] text-muted-foreground p-2">
                  +{artifacts.length - 20} more windows
                </p>
              )}
            </div>
          </details>
        )}
      </div>

      {/* MIND®Seizure */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-xs font-medium">MIND®Seizure</h3>
          <Badge variant="outline" className="text-[9px] ml-auto">{seizure.model || "heuristic_v0.1"}</Badge>
        </div>
        {ictNote && (
          <p className="text-[10px] text-muted-foreground px-1">{ictNote}</p>
        )}
        {seizureEvents.length === 0 ? (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            No seizure events detected
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            {seizureEvents.map((e: any, i: number) => (
              <button
                key={i}
                onClick={() => goToSeizure(e)}
                disabled={!studyId}
                className="flex items-center gap-3 p-2.5 border-t first:border-t-0 text-xs w-full text-left hover:bg-destructive/5 disabled:hover:bg-transparent transition-colors group"
              >
                <AlertCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                <span className="font-medium">{e.type || "Event"}</span>
                <span className="text-muted-foreground font-mono">
                  {e.onset_time != null ? `${e.onset_time}s` : "—"}
                  {" → "}
                  {e.offset_time != null ? `${e.offset_time}s` : "—"}
                </span>
                <span className="ml-auto font-mono text-[10px]">
                  {e.confidence != null ? `${(e.confidence * 100).toFixed(0)}% conf` : ""}
                </span>
                {studyId && (
                  <ExternalLink className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                )}
              </button>
            ))}
          </div>
        )}
        {iiedsNote && (
          <p className="text-[10px] text-muted-foreground px-1">IEDs: {iiedsNote}</p>
        )}
      </div>

      {/* SCORE EEG — Impression */}
      {impression && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-medium">SCORE EEG — Impression</h3>
            {sigLabel && sigColor && (
              <Badge className={`text-[9px] ml-auto ${sigColor}`}>
                {sigLabel}
              </Badge>
            )}
          </div>
          <p className="text-sm leading-relaxed">{impression}</p>
          {score.recommended_action && (
            <p className="text-[10px] text-muted-foreground">
              Recommended: {score.recommended_action}
            </p>
          )}
        </div>
      )}

      {/* MIND®SCORE — Full narrative */}
      {score.summary && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-medium">MIND®SCORE — Full Report</h3>
          </div>
          <p className="text-sm leading-relaxed">{score.summary}</p>
        </div>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/30 border">
        <Info className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[10px] text-muted-foreground">
          Quantitative inference from ONNX models (MIND®Triage AUC≈0.77, MIND®Clean AUC=0.726).
          Not a clinical interpretation. The reviewing physician determines significance.
          SCORE EEG format per Beniczky et al. 2013/2017.
        </p>
      </div>

      <p className="text-center text-[9px] text-muted-foreground font-mono">
        Generated {report.generated_at ? new Date(report.generated_at).toLocaleString() : "—"}
        {" · "}study {report.study_id?.slice(0, 8)}
        {" · "}Deterministic · Idempotent
      </p>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="p-2 rounded-lg border bg-background text-center">
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-bold tabular-nums font-mono ${highlight ? "text-emerald-500" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function ScoreField({
  label,
  value,
  sub,
  highlight,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="p-2 rounded-lg border bg-background">
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className={`text-xs font-medium font-mono ${highlight ? "text-emerald-500" : warn ? "text-amber-600" : ""}`}>
        {value}
      </p>
      {sub && <p className={`text-[9px] ${warn ? "text-amber-600" : "text-muted-foreground"}`}>{sub}</p>}
    </div>
  );
}
