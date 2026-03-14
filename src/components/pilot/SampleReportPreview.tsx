import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  Activity,
  Upload,
  Shield,
  BarChart3,
  Layers,
  Cpu,
  Info,
  ExternalLink,
  List,
  Pencil,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Input } from "@/components/ui/input";

interface SampleReportPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/* ─── Patient demographics (editable) ─── */
const DEFAULT_DEMO = { age: "45", sex: "M", date: "2026-03-12" };

/* ─── Pipeline ─── */
const PIPELINE = [
  { step: "Ingest", detail: "EDF parsed, header validated" },
  { step: "Resample", detail: "128 Hz (ENCEPHLIAN_EEG_v1)" },
  { step: "Filter", detail: "0.5–70 Hz BP, 50 Hz notch" },
  { step: "Artifact", detail: "MIND®Clean ICA rejection" },
  { step: "Montage", detail: "Avg ref, 21ch 10-20" },
  { step: "Segment", detail: "10s epochs, 50% overlap" },
  { step: "Analyze", detail: "MIND®Triage v1.0" },
];

/* ─── Spectral data ─── */
const SPECTRAL_DATA = [
  { region: "Frontal (Fp1/Fp2, F3/F4, Fz)", delta: 18.4, theta: 8.2, alpha: 5.1, beta: 3.7 },
  { region: "Temporal L (F7, T3, T5)", delta: 31.2, theta: 12.8, alpha: 4.3, beta: 2.9 },
  { region: "Temporal R (F8, T4, T6)", delta: 16.9, theta: 7.4, alpha: 5.8, beta: 3.4 },
  { region: "Central (C3/C4, Cz)", delta: 14.2, theta: 6.5, alpha: 8.9, beta: 4.1 },
  { region: "Parietal (P3/P4, Pz)", delta: 12.1, theta: 5.8, alpha: 11.2, beta: 3.9 },
  { region: "Occipital (O1/O2)", delta: 10.8, theta: 5.2, alpha: 14.6, beta: 3.2 },
];

/* ─── Asymmetry ─── */
const ASYMMETRY = [
  { pair: "F3–F4 (Frontal)", index: 0.04 },
  { pair: "T3–T4 (Temporal)", index: 0.29 },
  { pair: "C3–C4 (Central)", index: 0.06 },
  { pair: "P3–P4 (Parietal)", index: 0.03 },
  { pair: "O1–O2 (Occipital)", index: 0.05 },
];

/* ─── Markers (clickable) ─── */
const MARKERS = [
  { id: 1, epoch: 34, time: "00:05:24", timeSec: 324, channel: "T3–T5", metric: "Delta power", value: "38.4 µV²/Hz", zscore: 3.2 },
  { id: 2, epoch: 47, time: "00:07:41", timeSec: 461, channel: "F7–T3", metric: "θ/α ratio", value: "2.98", zscore: 2.8 },
  { id: 3, epoch: 85, time: "00:14:02", timeSec: 842, channel: "T3–T5", metric: "Delta power", value: "42.1 µV²/Hz", zscore: 3.6 },
  { id: 4, epoch: 112, time: "00:18:31", timeSec: 1111, channel: "T5–O1", metric: "Delta power", value: "35.7 µV²/Hz", zscore: 2.9 },
  { id: 5, epoch: 156, time: "00:25:48", timeSec: 1548, channel: "F7–T3", metric: "θ/α ratio", value: "2.54", zscore: 2.4 },
];

const SIGNAL = { total: 21, good: 19, noisy: 2, noisyLabels: ["T3", "Fp1"], artifactPct: 8.3, totalEpochs: 192, clean: 176 };

export default function SampleReportPreview({ open, onOpenChange }: SampleReportPreviewProps) {
  const navigate = useNavigate();
  const [demo, setDemo] = useState(DEFAULT_DEMO);
  const [editingDemo, setEditingDemo] = useState(false);

  const studyId = "sample"; // sample study

  const goToMarker = (timeSec: number) => {
    onOpenChange(false);
    navigate(`/app/eeg-viewer?study=${studyId}&t=${timeSec}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-primary" />
            MIND®Triage
          </DialogTitle>
          <DialogDescription className="text-xs">
            Quantitative EEG markers — clinician interprets
          </DialogDescription>
        </DialogHeader>

        {/* ─── Header: Recording + Patient ─── */}
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-mono text-muted-foreground">
              MIND®Triage v1.0 · ENCEPHLIAN_EEG_v1
            </p>
            <Badge variant="outline" className="text-[9px] gap-1">
              <Shield className="h-2.5 w-2.5" /> Sample
            </Badge>
          </div>

          {/* Patient demographics — inline editable */}
          <div className="flex items-center gap-2 flex-wrap">
            {editingDemo ? (
              <div className="flex items-center gap-1.5">
                <Input
                  className="h-6 w-12 text-xs px-1 font-mono"
                  value={demo.age}
                  onChange={(e) => setDemo({ ...demo, age: e.target.value })}
                  placeholder="Age"
                />
                <span className="text-muted-foreground text-xs">/</span>
                <Input
                  className="h-6 w-10 text-xs px-1 font-mono"
                  value={demo.sex}
                  onChange={(e) => setDemo({ ...demo, sex: e.target.value })}
                  placeholder="Sex"
                />
                <span className="text-muted-foreground text-xs">·</span>
                <Input
                  type="date"
                  className="h-6 w-28 text-xs px-1 font-mono"
                  value={demo.date}
                  onChange={(e) => setDemo({ ...demo, date: e.target.value })}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setEditingDemo(false)}
                >
                  Done
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setEditingDemo(true)}
                className="flex items-center gap-1.5 text-xs font-mono hover:text-primary transition-colors group"
              >
                <span className="font-semibold">{demo.age}y/{demo.sex}</span>
                <span className="text-muted-foreground">· {demo.date}</span>
                <Pencil className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
          </div>

          <Separator />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div>
              <p className="text-muted-foreground">Recording</p>
              <p className="font-medium font-mono">21ch · 256Hz · 32m</p>
            </div>
            <div>
              <p className="text-muted-foreground">Post-process</p>
              <p className="font-medium font-mono">128Hz · avg ref</p>
            </div>
            <div>
              <p className="text-muted-foreground">Epochs</p>
              <p className="font-medium font-mono">{SIGNAL.clean}/{SIGNAL.totalEpochs} clean</p>
            </div>
            <div>
              <p className="text-muted-foreground">Artifact</p>
              <p className="font-medium font-mono">{SIGNAL.artifactPct}% rejected</p>
            </div>
          </div>
        </div>

        {/* ─── Pipeline (collapsed) ─── */}
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer text-xs font-medium py-1 select-none text-muted-foreground hover:text-foreground transition-colors">
            <Cpu className="h-3.5 w-3.5" />
            Pipeline ({PIPELINE.length} steps)
          </summary>
          <div className="mt-1.5 space-y-1">
            {PIPELINE.map((p, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px] py-1 px-2 rounded bg-muted/30">
                <span className="font-mono font-bold text-muted-foreground w-3 shrink-0">{i + 1}</span>
                <span className="font-medium">{p.step}</span>
                <span className="text-muted-foreground">— {p.detail}</span>
              </div>
            ))}
          </div>
        </details>

        {/* ─── Signal Quality (compact) ─── */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-medium">Signal Quality</h3>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            <MiniMetric label="Channels" value={`${SIGNAL.good}/${SIGNAL.total}`} />
            <MiniMetric label="Noisy" value={SIGNAL.noisy.toString()} sub={SIGNAL.noisyLabels.join(", ")} />
            <MiniMetric label="Artifact" value={`${SIGNAL.artifactPct}%`} />
            <MiniMetric label="Clean" value={SIGNAL.clean.toString()} sub={`of ${SIGNAL.totalEpochs}`} />
          </div>
        </div>

        {/* ─── Markers List (clickable → EEG Viewer) ─── */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <List className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-medium">Markers</h3>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {MARKERS.length} flagged · z ≥ 2.0 · click to view
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
            {MARKERS.map((m) => (
              <button
                key={m.id}
                onClick={() => goToMarker(m.timeSec)}
                className="grid grid-cols-[3rem_4rem_4.5rem_1fr_4rem_3rem] gap-1 p-1.5 text-[11px] border-t w-full text-left hover:bg-primary/5 transition-colors group"
              >
                <span className="tabular-nums font-mono">#{m.epoch}</span>
                <span className="tabular-nums font-mono">{m.time}</span>
                <span className="font-medium">{m.channel}</span>
                <span className="text-muted-foreground">{m.metric}</span>
                <span className="tabular-nums font-mono">{m.value}</span>
                <span className="tabular-nums font-mono flex items-center gap-0.5">
                  {m.zscore.toFixed(1)}
                  <ExternalLink className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </span>
              </button>
            ))}
          </div>
          <p className="text-[9px] text-muted-foreground px-1">
            z-scores vs within-recording distribution · click any row to review in EEG Viewer
          </p>
        </div>

        {/* ─── Marker Timeline Bar ─── */}
        <div className="space-y-1">
          <p className="text-[9px] text-muted-foreground font-mono">
            0:00 ────────────────────────────────────────── 32:00
          </p>
          <div className="relative h-3 bg-muted rounded-sm overflow-hidden">
            {MARKERS.map((m) => (
              <button
                key={m.id}
                onClick={() => goToMarker(m.timeSec)}
                className="absolute top-0 h-full w-0.5 bg-primary hover:bg-primary/80 hover:w-1 transition-all cursor-pointer"
                style={{ left: `${(m.timeSec / 1920) * 100}%` }}
                title={`${m.time} · ${m.channel} · z=${m.zscore}`}
              />
            ))}
          </div>
        </div>

        {/* ─── Spectral Power (neutral — no flags) ─── */}
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
            {SPECTRAL_DATA.map((row, i) => (
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

        {/* ─── Asymmetry (neutral — no pre-judgment) ─── */}
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
            {ASYMMETRY.map((row, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 p-1.5 text-[11px] border-t">
                <span className="font-medium text-[10px]">{row.pair}</span>
                <span className="tabular-nums font-mono">{row.index.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </details>

        {/* ─── Disclaimer ─── */}
        <div className="flex items-start gap-2 p-2 rounded-lg bg-muted/30 border">
          <Info className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground">
            Quantitative metrics from deterministic processing. Not a clinical
            interpretation. The reviewing physician determines significance.
          </p>
        </div>

        {/* ─── Version ─── */}
        <p className="text-center text-[9px] text-muted-foreground font-mono">
          MIND®Triage v1.0 · MIND®Clean v1.0 · Deterministic · Idempotent
        </p>

        {/* ─── CTA ─── */}
        <div className="flex gap-2 pt-1">
          <Button
            onClick={() => { onOpenChange(false); navigate("/app/studies"); }}
            className="flex-1 gap-2 rounded-full text-xs"
            size="sm"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload Your EEG
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1 rounded-full text-xs"
            size="sm"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Compact metric cell ─── */
function MiniMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-2 rounded-lg border bg-background text-center">
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold tabular-nums font-mono">{value}</p>
      {sub && <p className="text-[9px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
