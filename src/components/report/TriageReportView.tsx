import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  FileText, Activity, Shield, BarChart3, Layers,
  Cpu, Info, ExternalLink, List,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface TriageReportViewProps {
  data: any;
  studyId: string;
  patientAge?: string;
  patientGender?: string;
  studyDate?: string;
}

export default function TriageReportView({
  data, studyId, patientAge, patientGender, studyDate,
}: TriageReportViewProps) {
  const navigate = useNavigate();

  if (!data) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No MIND®Triage data available</p>
      </div>
    );
  }

  const sq = data.signal_quality || {};
  const spectral = data.spectral_power || [];
  const asymmetry = data.asymmetry || [];
  const markers = data.markers || [];
  const rec = data.recording_info || {};
  const pipeline = data.pipeline || [];
  const durationSec = (rec.duration_min || 30) * 60;

  const goToMarker = (m: any) => {
    const params = new URLSearchParams({
      studyId,
      t: String(m.time_sec),
      focus: "segment",
      label: m.metric || "marker",
    });
    if (m.channel) params.set("ch", m.channel);
    if (m.zscore != null) params.set("score", String(m.zscore));
    // Set t_end to t + 10s (one epoch)
    params.set("t_end", String((m.time_sec || 0) + 10));
    navigate(`/app/eeg-viewer?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-mono text-muted-foreground">
            MIND®Triage v1.0 · ENCEPHLIAN_EEG_v1
          </p>
          <Badge variant="outline" className="text-[9px] gap-1">
            <Shield className="h-2.5 w-2.5" />
            {data.model_version?.includes("ai") ? "AI" : "Deterministic"}
          </Badge>
        </div>

        {/* Demographics */}
        <div className="flex items-center gap-1.5 text-xs font-mono">
          <span className="font-semibold">
            {patientAge || "—"}y/{patientGender?.charAt(0)?.toUpperCase() || "—"}
          </span>
          <span className="text-muted-foreground">· {studyDate || "—"}</span>
        </div>

        <Separator />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
          <div>
            <p className="text-muted-foreground">Recording</p>
            <p className="font-medium font-mono">
              {rec.channels || 21}ch · {rec.sample_rate_hz || 256}Hz · {rec.duration_min || 30}m
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Post-process</p>
            <p className="font-medium font-mono">{rec.post_process_hz || 128}Hz · {rec.reference || "avg ref"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Epochs</p>
            <p className="font-medium font-mono">{sq.clean_epochs || "—"}/{sq.total_epochs || "—"} clean</p>
          </div>
          <div>
            <p className="text-muted-foreground">Artifact</p>
            <p className="font-medium font-mono">{sq.artifact_pct ?? "—"}% rejected</p>
          </div>
        </div>
      </div>

      {/* Pipeline */}
      {pipeline.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer text-xs font-medium py-1 select-none text-muted-foreground hover:text-foreground transition-colors">
            <Cpu className="h-3.5 w-3.5" />
            Pipeline ({pipeline.length} steps)
          </summary>
          <div className="mt-1.5 space-y-1">
            {pipeline.map((p: any, i: number) => (
              <div key={i} className="flex items-start gap-2 text-[11px] py-1 px-2 rounded bg-muted/30">
                <span className="font-mono font-bold text-muted-foreground w-3 shrink-0">{i + 1}</span>
                <span className="font-medium">{p.step}</span>
                <span className="text-muted-foreground">— {p.detail}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Signal Quality */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-xs font-medium">Signal Quality</h3>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          <MiniMetric label="Channels" value={`${sq.good_channels || "—"}/${sq.total_channels || "—"}`} />
          <MiniMetric label="Noisy" value={String(sq.noisy_channels || 0)} sub={sq.noisy_labels?.join(", ")} />
          <MiniMetric label="Artifact" value={`${sq.artifact_pct ?? "—"}%`} />
          <MiniMetric label="Clean" value={String(sq.clean_epochs || "—")} sub={`of ${sq.total_epochs || "—"}`} />
        </div>
      </div>

      {/* Markers */}
      {markers.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <List className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-medium">Markers</h3>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {markers.length} flagged · z ≥ 2.0 · click to view
            </span>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-[3rem_4rem_4.5rem_1fr_4rem_3rem] gap-1 p-1.5 bg-muted/50 text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
              <span>Epoch</span>
              <span>Time</span>
              <span>Channel</span>
              <span>Metric</span>
              <span>Value</span>
              <span>z</span>
            </div>
            {markers.map((m: any, i: number) => (
              <button
                key={i}
                onClick={() => goToMarker(m.time_sec)}
                className="grid grid-cols-[3rem_4rem_4.5rem_1fr_4rem_3rem] gap-1 p-1.5 text-[11px] border-t w-full text-left hover:bg-primary/5 transition-colors group"
              >
                <span className="tabular-nums font-mono">#{m.epoch}</span>
                <span className="tabular-nums font-mono">{m.time}</span>
                <span className="font-medium">{m.channel}</span>
                <span className="text-muted-foreground truncate">{m.metric}</span>
                <span className="tabular-nums font-mono text-[10px]">{m.value}</span>
                <span className="tabular-nums font-mono flex items-center gap-0.5">
                  {typeof m.zscore === "number" ? m.zscore.toFixed(1) : m.zscore}
                  <ExternalLink className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </span>
              </button>
            ))}
          </div>
          <p className="text-[9px] text-muted-foreground px-1">
            z-scores vs within-recording distribution · click any row to review in EEG Viewer
          </p>
        </div>
      )}

      {/* Timeline Bar */}
      {markers.length > 0 && (
        <div className="space-y-1">
          <p className="text-[9px] text-muted-foreground font-mono">
            0:00 ────────────────────────────────────────── {Math.floor(durationSec / 60)}:00
          </p>
          <div className="relative h-3 bg-muted rounded-sm overflow-hidden">
            {markers.map((m: any, i: number) => (
              <button
                key={i}
                onClick={() => goToMarker(m.time_sec)}
                className="absolute top-0 h-full w-0.5 bg-primary hover:bg-primary/80 hover:w-1 transition-all cursor-pointer"
                style={{ left: `${(m.time_sec / durationSec) * 100}%` }}
                title={`${m.time} · ${m.channel} · z=${m.zscore}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Spectral Power */}
      {spectral.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer text-xs font-medium py-1 select-none text-muted-foreground hover:text-foreground transition-colors">
            <BarChart3 className="h-3.5 w-3.5" />
            Spectral Power by Region
            <span className="text-[9px] text-muted-foreground ml-1">(µV²/Hz)</span>
          </summary>
          <div className="mt-1.5 rounded-lg border overflow-hidden">
            <div className="grid grid-cols-6 gap-1 p-1.5 bg-muted/50 text-[9px] font-medium text-muted-foreground">
              <span className="col-span-2">Region</span>
              <span>δ</span>
              <span>θ</span>
              <span>α</span>
              <span>β</span>
            </div>
            {spectral.map((row: any, i: number) => (
              <div key={i} className="grid grid-cols-6 gap-1 p-1.5 text-[11px] border-t">
                <span className="col-span-2 font-medium text-[10px]">{row.region}</span>
                <span className="tabular-nums font-mono">{row.delta}</span>
                <span className="tabular-nums font-mono">{row.theta}</span>
                <span className="tabular-nums font-mono">{row.alpha}</span>
                <span className="tabular-nums font-mono">{row.beta}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Asymmetry */}
      {asymmetry.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer text-xs font-medium py-1 select-none text-muted-foreground hover:text-foreground transition-colors">
            <Layers className="h-3.5 w-3.5" />
            Asymmetry Index
            <span className="text-[9px] text-muted-foreground ml-1">(|L−R|/(L+R))</span>
          </summary>
          <div className="mt-1.5 rounded-lg border overflow-hidden">
            <div className="grid grid-cols-2 gap-2 p-1.5 bg-muted/50 text-[9px] font-medium text-muted-foreground">
              <span>Pair</span>
              <span>Index</span>
            </div>
            {asymmetry.map((row: any, i: number) => (
              <div key={i} className="grid grid-cols-2 gap-2 p-1.5 text-[11px] border-t">
                <span className="font-medium text-[10px]">{row.pair}</span>
                <span className="tabular-nums font-mono">{typeof row.index === "number" ? row.index.toFixed(2) : row.index}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Disclaimer */}
      <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/30 border">
        <Info className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[10px] text-muted-foreground">
          Quantitative metrics from deterministic processing. Not a clinical
          interpretation. The reviewing physician determines significance.
        </p>
      </div>

      {/* Version footer */}
      <p className="text-center text-[9px] text-muted-foreground font-mono">
        {data.model_version || "MIND®Triage v1.0"} · Generated {data.generated_at ? new Date(data.generated_at).toLocaleString() : "—"}
      </p>
    </div>
  );
}

function MiniMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-2 rounded-lg border bg-background text-center">
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold tabular-nums font-mono">{value}</p>
      {sub && <p className="text-[9px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
