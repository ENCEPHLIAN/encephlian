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
  Brain,
  FileText,
  AlertTriangle,
  Activity,
  Upload,
  Clock,
  Shield,
  BarChart3,
  Layers,
  Cpu,
  Info,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface SampleReportPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/* ─── Methodology pipeline steps ─── */
const PIPELINE = [
  { step: "Ingest", detail: "EDF parsed, header validated, metadata extracted" },
  { step: "Resample", detail: "Resampled to 128 Hz (ENCEPHLIAN_EEG_v1 standard)" },
  { step: "Filter", detail: "0.5–70 Hz bandpass, 50 Hz notch filter applied" },
  { step: "Artifact", detail: "MIND®Clean: ICA-based artifact rejection (eye blinks, muscle, line noise)" },
  { step: "Montage", detail: "Average reference montage, 21 standard 10-20 channels retained" },
  { step: "Segment", detail: "10-second epochs, 50% overlap, 192 epochs total" },
  { step: "Analyze", detail: "MIND®Triage v1.0: spectral decomposition, asymmetry, outlier detection" },
];

/* ─── Spectral band data (per-region averages) ─── */
const SPECTRAL_DATA = [
  {
    region: "Frontal (Fp1/Fp2, F3/F4, Fz)",
    delta: 18.4,
    theta: 8.2,
    alpha: 5.1,
    beta: 3.7,
    flag: null,
  },
  {
    region: "Temporal L (F7, T3, T5)",
    delta: 31.2,
    theta: 12.8,
    alpha: 4.3,
    beta: 2.9,
    flag: "elevated_delta",
  },
  {
    region: "Temporal R (F8, T4, T6)",
    delta: 16.9,
    theta: 7.4,
    alpha: 5.8,
    beta: 3.4,
    flag: null,
  },
  {
    region: "Central (C3/C4, Cz)",
    delta: 14.2,
    theta: 6.5,
    alpha: 8.9,
    beta: 4.1,
    flag: null,
  },
  {
    region: "Parietal (P3/P4, Pz)",
    delta: 12.1,
    theta: 5.8,
    alpha: 11.2,
    beta: 3.9,
    flag: null,
  },
  {
    region: "Occipital (O1/O2)",
    delta: 10.8,
    theta: 5.2,
    alpha: 14.6,
    beta: 3.2,
    flag: null,
  },
];

/* ─── Asymmetry indices ─── */
const ASYMMETRY = [
  { pair: "F3–F4 (Frontal)", index: 0.04, flag: null },
  { pair: "T3–T4 (Temporal)", index: 0.29, flag: "asymmetry" },
  { pair: "C3–C4 (Central)", index: 0.06, flag: null },
  { pair: "P3–P4 (Parietal)", index: 0.03, flag: null },
  { pair: "O1–O2 (Occipital)", index: 0.05, flag: null },
];

/* ─── Flagged segments ─── */
const FLAGGED_SEGMENTS = [
  {
    epoch: 34,
    time: "00:05:24",
    duration: "10s",
    channel: "T3–T5",
    metric: "Delta power",
    value: "38.4 µV²/Hz",
    zscore: 3.2,
  },
  {
    epoch: 47,
    time: "00:07:41",
    duration: "10s",
    channel: "F7–T3",
    metric: "Theta/Alpha ratio",
    value: "2.98",
    zscore: 2.8,
  },
  {
    epoch: 85,
    time: "00:14:02",
    duration: "10s",
    channel: "T3–T5",
    metric: "Delta power",
    value: "42.1 µV²/Hz",
    zscore: 3.6,
  },
  {
    epoch: 112,
    time: "00:18:31",
    duration: "10s",
    channel: "T5–O1",
    metric: "Delta power",
    value: "35.7 µV²/Hz",
    zscore: 2.9,
  },
  {
    epoch: 156,
    time: "00:25:48",
    duration: "10s",
    channel: "F7–T3",
    metric: "Theta/Alpha ratio",
    value: "2.54",
    zscore: 2.4,
  },
];

/* ─── Signal quality ─── */
const SIGNAL_QUALITY = {
  totalChannels: 21,
  goodChannels: 19,
  noisyChannels: 2,
  noisyLabels: ["T3", "Fp1"],
  artifactRejectionRate: 8.3,
  totalEpochs: 192,
  cleanEpochs: 176,
};

export default function SampleReportPreview({
  open,
  onOpenChange,
}: SampleReportPreviewProps) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Sample Triage Report
          </DialogTitle>
          <DialogDescription>
            Quantitative EEG analysis — what your report will actually look like
          </DialogDescription>
        </DialogHeader>

        {/* ─── Report Header ─── */}
        <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-semibold">
                ENCEPHLIAN Accelerated Triage Report
              </p>
              <p className="text-[11px] text-muted-foreground font-mono">
                MIND®Triage v1.0 · ENCEPHLIAN_EEG_v1 · Deterministic Output
              </p>
            </div>
            <Badge variant="outline" className="text-[10px] gap-1">
              <Shield className="h-3 w-3" />
              Sample
            </Badge>
          </div>
          <Separator />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">Recording</p>
              <p className="font-medium">21ch · 256Hz · 32 min</p>
            </div>
            <div>
              <p className="text-muted-foreground">Post-processing</p>
              <p className="font-medium">128Hz · 21ch · avg ref</p>
            </div>
            <div>
              <p className="text-muted-foreground">Epochs</p>
              <p className="font-medium">
                {SIGNAL_QUALITY.cleanEpochs}/{SIGNAL_QUALITY.totalEpochs} clean
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Processing</p>
              <p className="font-medium">18 min · Deterministic</p>
            </div>
          </div>
        </div>

        {/* ─── Methodology (transparent) ─── */}
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer text-sm font-semibold py-1 select-none">
            <Cpu className="h-4 w-4 text-primary" />
            Processing Pipeline
            <Badge
              variant="secondary"
              className="text-[9px] px-1.5 py-0 ml-auto group-open:hidden"
            >
              {PIPELINE.length} steps · click to expand
            </Badge>
          </summary>
          <div className="mt-2 space-y-1.5">
            {PIPELINE.map((p, i) => (
              <div
                key={i}
                className="flex items-start gap-3 text-xs py-1.5 px-2 rounded-lg bg-muted/30"
              >
                <span className="font-mono font-bold text-primary w-4 shrink-0 tabular-nums">
                  {i + 1}
                </span>
                <div>
                  <span className="font-semibold">{p.step}</span>
                  <span className="text-muted-foreground ml-1.5">
                    — {p.detail}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 mt-2 p-2.5 rounded-lg bg-primary/5 border border-primary/10">
            <Info className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground">
              <strong className="text-foreground">Idempotent guarantee:</strong>{" "}
              Same input EDF → identical output report. All processing is
              deterministic and versioned. No stochastic components.
            </p>
          </div>
        </details>

        {/* ─── Signal Quality ─── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Signal Quality</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MetricBox
              label="Channels"
              value={`${SIGNAL_QUALITY.goodChannels}/${SIGNAL_QUALITY.totalChannels}`}
              sub="usable"
              ok
            />
            <MetricBox
              label="Noisy"
              value={SIGNAL_QUALITY.noisyChannels.toString()}
              sub={SIGNAL_QUALITY.noisyLabels.join(", ")}
              ok={SIGNAL_QUALITY.noisyChannels <= 2}
            />
            <MetricBox
              label="Artifact %"
              value={`${SIGNAL_QUALITY.artifactRejectionRate}%`}
              sub="epochs rejected"
              ok={SIGNAL_QUALITY.artifactRejectionRate < 15}
            />
            <MetricBox
              label="Clean Epochs"
              value={SIGNAL_QUALITY.cleanEpochs.toString()}
              sub={`of ${SIGNAL_QUALITY.totalEpochs}`}
              ok
            />
          </div>
        </div>

        {/* ─── Spectral Power by Region ─── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">
              Spectral Power by Region
            </h3>
            <span className="text-[10px] text-muted-foreground">
              (µV²/Hz, band averages)
            </span>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-6 gap-1 p-2 bg-muted/50 text-[10px] font-medium text-muted-foreground">
              <span className="col-span-2">Region</span>
              <span>δ Delta</span>
              <span>θ Theta</span>
              <span>α Alpha</span>
              <span>β Beta</span>
            </div>
            {SPECTRAL_DATA.map((row, i) => (
              <div
                key={i}
                className={cn(
                  "grid grid-cols-6 gap-1 p-2 text-xs border-t",
                  row.flag && "bg-amber-500/5"
                )}
              >
                <span className="col-span-2 text-[11px] font-medium flex items-center gap-1">
                  {row.region}
                  {row.flag && (
                    <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
                  )}
                </span>
                <span
                  className={cn(
                    "tabular-nums",
                    row.flag === "elevated_delta" && "font-semibold text-amber-600"
                  )}
                >
                  {row.delta}
                </span>
                <span className="tabular-nums">{row.theta}</span>
                <span className="tabular-nums">{row.alpha}</span>
                <span className="tabular-nums">{row.beta}</span>
              </div>
            ))}
          </div>
          {/* Suggestive flag — not declarative */}
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/5 border border-amber-500/15">
            <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground">
              <strong className="text-foreground">Flag:</strong> Left temporal
              region shows elevated delta power (31.2 µV²/Hz) relative to
              contralateral side (16.9 µV²/Hz). This is a quantitative
              observation — clinical correlation is required.
            </p>
          </div>
        </div>

        {/* ─── Asymmetry Indices ─── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Asymmetry Index</h3>
            <span className="text-[10px] text-muted-foreground">
              (|L−R| / (L+R), 0 = symmetric)
            </span>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-3 gap-2 p-2 bg-muted/50 text-[10px] font-medium text-muted-foreground">
              <span>Channel Pair</span>
              <span>Index</span>
              <span>Status</span>
            </div>
            {ASYMMETRY.map((row, i) => (
              <div
                key={i}
                className={cn(
                  "grid grid-cols-3 gap-2 p-2 text-xs border-t",
                  row.flag && "bg-amber-500/5"
                )}
              >
                <span className="font-medium text-[11px]">{row.pair}</span>
                <span
                  className={cn(
                    "tabular-nums font-mono",
                    row.flag && "font-semibold text-amber-600"
                  )}
                >
                  {row.index.toFixed(2)}
                </span>
                <span>
                  {row.flag ? (
                    <Badge
                      variant="outline"
                      className="text-[9px] px-1.5 py-0 border-amber-500/50 text-amber-600"
                    >
                      Asymmetry detected
                    </Badge>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      Within normal range
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Flagged Segments ─── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Flagged Segments</h3>
            <span className="text-[10px] text-muted-foreground">
              (z-score ≥ 2.0 vs recording baseline)
            </span>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <div className="grid grid-cols-6 gap-1 p-2 bg-muted/50 text-[10px] font-medium text-muted-foreground">
              <span>Epoch</span>
              <span>Time</span>
              <span>Channel</span>
              <span>Metric</span>
              <span>Value</span>
              <span>z-score</span>
            </div>
            {FLAGGED_SEGMENTS.map((seg, i) => (
              <div key={i} className="grid grid-cols-6 gap-1 p-2 text-xs border-t">
                <span className="tabular-nums font-mono">#{seg.epoch}</span>
                <span className="tabular-nums font-mono">{seg.time}</span>
                <span className="font-medium">{seg.channel}</span>
                <span className="text-muted-foreground">{seg.metric}</span>
                <span className="tabular-nums">{seg.value}</span>
                <span
                  className={cn(
                    "tabular-nums font-semibold",
                    seg.zscore >= 3.0
                      ? "text-amber-600"
                      : "text-muted-foreground"
                  )}
                >
                  {seg.zscore.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground px-1">
            {FLAGGED_SEGMENTS.length} of {SIGNAL_QUALITY.cleanEpochs} clean
            epochs flagged · z-scores computed against within-recording
            distribution · segments available for review in EEG Viewer
          </p>
        </div>

        {/* ─── Summary (quantitative, suggestive, NOT declarative) ─── */}
        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            Quantitative Summary
          </h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Recording:</strong> 32-minute
              routine EEG, 21 channels, 192 epochs (176 clean after artifact
              rejection, 8.3% rejected).
            </p>
            <p>
              <strong className="text-foreground">Spectral:</strong> Left
              temporal region (T3, T5, F7) shows elevated delta power (31.2
              µV²/Hz) compared to right temporal (16.9 µV²/Hz). Posterior
              dominant rhythm measured at 7.5 Hz (alpha band).
            </p>
            <p>
              <strong className="text-foreground">Asymmetry:</strong> T3–T4
              asymmetry index 0.29 (elevated). All other pairs within normal
              range (≤0.06).
            </p>
            <p>
              <strong className="text-foreground">Flagged segments:</strong> 5
              of 176 epochs exceed z≥2.0 threshold, concentrated in left
              temporal derivations (T3–T5, F7–T3).
            </p>
          </div>
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-background/50 border">
            <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted-foreground">
              This report presents quantitative metrics derived from
              deterministic signal processing. It does not constitute a clinical
              interpretation or diagnosis. All flagged observations require
              clinical correlation by a qualified physician.
            </p>
          </div>
        </div>

        {/* ─── Version stamp ─── */}
        <div className="text-center text-[10px] text-muted-foreground font-mono space-y-0.5">
          <p>MIND®Triage v1.0 · MIND®Clean v1.0 · ENCEPHLIAN_EEG_v1</p>
          <p>Deterministic · Idempotent · Version-stamped</p>
        </div>

        {/* ─── CTA ─── */}
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <Button
            onClick={() => {
              onOpenChange(false);
              navigate("/app/studies");
            }}
            className="flex-1 gap-2 rounded-full"
          >
            <Upload className="h-4 w-4" />
            Upload Your EEG
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1 rounded-full"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Metric Box sub-component ─── */
function MetricBox({
  label,
  value,
  sub,
  ok,
}: {
  label: string;
  value: string;
  sub: string;
  ok: boolean;
}) {
  return (
    <div
      className={cn(
        "p-2.5 rounded-lg border text-center",
        ok ? "bg-background" : "bg-amber-500/5 border-amber-500/20"
      )}
    >
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-lg font-bold tabular-nums",
          !ok && "text-amber-600"
        )}
      >
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}
