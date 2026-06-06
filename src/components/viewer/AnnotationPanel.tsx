import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { List, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Segment {
  t_start_s: number;
  t_end_s: number;
  label: string;
  channel_index?: number | null;
  score?: number | null;
}

// ── Color palette ─────────────────────────────────────────────────────────────
export const SEGMENT_LABEL_COLORS: Record<string, { bg: string; border: string; badge: string }> = {
  seizure:       { bg: "rgba(239,68,68,0.18)",   border: "rgba(239,68,68,0.75)",   badge: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30" },
  spike:         { bg: "rgba(249,115,22,0.18)",  border: "rgba(249,115,22,0.75)",  badge: "bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30" },
  eye_movement:  { bg: "rgba(139,92,246,0.18)",  border: "rgba(139,92,246,0.75)",  badge: "bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30" },
  muscle:        { bg: "rgba(249,115,22,0.12)",  border: "rgba(249,115,22,0.6)",   badge: "bg-orange-400/20 text-orange-600 dark:text-orange-400 border-orange-400/30" },
  electrode:     { bg: "rgba(234,179,8,0.15)",   border: "rgba(234,179,8,0.65)",   badge: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30" },
  electrode_noise: { bg: "rgba(234,179,8,0.15)", border: "rgba(234,179,8,0.65)",   badge: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30" },
  artifact:      { bg: "rgba(234,179,8,0.18)",   border: "rgba(234,179,8,0.7)",    badge: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30" },
  noisy_channel: { bg: "rgba(234,179,8,0.12)",   border: "rgba(234,179,8,0.6)",    badge: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30" },
  sleep_spindle: { bg: "rgba(168,85,247,0.18)",  border: "rgba(168,85,247,0.7)",   badge: "bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30" },
  k_complex:     { bg: "rgba(139,92,246,0.18)",  border: "rgba(139,92,246,0.7)",   badge: "bg-violet-500/20 text-violet-700 dark:text-violet-400 border-violet-500/30" },
  slow_wave:     { bg: "rgba(99,102,241,0.18)",  border: "rgba(99,102,241,0.7)",   badge: "bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 border-indigo-500/30" },
  normal:        { bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.6)",    badge: "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30" },
  alpha:         { bg: "rgba(34,197,94,0.15)",   border: "rgba(34,197,94,0.65)",   badge: "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30" },
  beta:          { bg: "rgba(6,182,212,0.18)",   border: "rgba(6,182,212,0.7)",    badge: "bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border-cyan-500/30" },
  theta:         { bg: "rgba(20,184,166,0.18)",  border: "rgba(20,184,166,0.7)",   badge: "bg-teal-500/20 text-teal-700 dark:text-teal-400 border-teal-500/30" },
  delta:         { bg: "rgba(59,130,246,0.18)",  border: "rgba(59,130,246,0.7)",   badge: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30" },
};

const DEFAULT_COLOR = {
  bg: "rgba(148,163,184,0.12)",
  border: "rgba(148,163,184,0.5)",
  badge: "bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30",
};

export function getSegmentColor(label: string) {
  const lc = label.toLowerCase();
  if (SEGMENT_LABEL_COLORS[lc]) return SEGMENT_LABEL_COLORS[lc];
  for (const [k, v] of Object.entries(SEGMENT_LABEL_COLORS)) {
    if (lc.includes(k) || k.includes(lc)) return v;
  }
  return DEFAULT_COLOR;
}

// Full medical-grade segment labels. Renamed from the prior abbreviation
// table (Seiz / Musc / K-Cx / SlwW / Spin) — clinicians read these names
// in a report, not slang. Long names get text-ellipsis treatment in the
// rendered row, so widening doesn't break the layout.
const LABEL_DISPLAY: Record<string, string> = {
  seizure:         "Seizure",
  spike:           "Spike",
  eye_movement:    "Eye movement",
  muscle:          "Muscle artifact",
  electrode:       "Electrode artifact",
  electrode_noise: "Electrode noise",
  artifact:        "Artifact",
  noisy_channel:   "Noisy channel",
  sleep_spindle:   "Sleep spindle",
  k_complex:       "K-complex",
  slow_wave:       "Slow wave",
  normal:          "Normal",
  alpha:           "Alpha rhythm",
  beta:            "Beta rhythm",
  theta:           "Theta activity",
  delta:           "Delta activity",
};

function displayLabel(label: string): string {
  return LABEL_DISPLAY[label.toLowerCase()]
    ?? (label.charAt(0).toUpperCase() + label.slice(1).replace(/_/g, " "));
}

function fmtSec(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return m > 0 ? `${m}:${sec.padStart(4, "0")}` : `${sec}s`;
}

function fmtDur(start: number, end: number): string {
  const d = end - start;
  return d < 1 ? `${(d * 1000).toFixed(0)}ms` : `${d.toFixed(1)}s`;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface AnnotationPanelProps {
  segments: Segment[];
  currentSegmentIndex: number;
  isOpen: boolean;
  onToggle: () => void;
  onSegmentClick: (segment: Segment, index: number) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function AnnotationPanel({
  segments,
  currentSegmentIndex,
  isOpen,
  onToggle,
  onSegmentClick,
}: AnnotationPanelProps) {

  // Type breakdown for header
  const labelCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of segments) c[s.label] = (c[s.label] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [segments]);

  // Collapsed: floating badge button. Title shows plural-aware full sentence so
  // hovering tells you exactly what the count means without opening the panel.
  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title={`${segments.length} detected segment${segments.length === 1 ? "" : "s"} — click to open the list`}
        className={cn(
          "absolute right-2 top-1/2 z-20 -translate-y-1/2",
          "flex flex-col items-center justify-center gap-0.5",
          "h-11 w-8 rounded-md",
          "border border-border/50 bg-background/95 shadow-sm backdrop-blur-sm",
          "text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors",
        )}
      >
        <List className="h-4 w-4" />
        {segments.length > 0 && (
          <span className="text-[10px] font-mono font-semibold tabular-nums">
            {segments.length > 99 ? "99+" : segments.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="w-72 h-full flex flex-col border-l border-border/60 bg-background/98">

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
        <div className="flex items-center gap-2">
          <List className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold">Detected Segments</span>
          <span
            className="text-[10px] font-mono text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded"
            title={`${segments.length} segment${segments.length === 1 ? "" : "s"} detected`}
          >
            {segments.length}
          </span>
        </div>
        <button
          onClick={onToggle}
          title="Close segment list"
          className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Type breakdown — full-name chips (truncate to 5 chips so column doesn't wrap) */}
      {labelCounts.length > 0 && (
        <div className="flex flex-wrap gap-x-2.5 gap-y-1 px-3 py-1.5 border-b border-border/30">
          {labelCounts.slice(0, 5).map(([label, count]) => {
            const c = getSegmentColor(label);
            const name = displayLabel(label);
            return (
              <span
                key={label}
                title={`${count} ${name.toLowerCase()}${count === 1 ? "" : "s"}`}
                className="flex items-center gap-1 text-[10px] text-muted-foreground min-w-0"
              >
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: c.border }} />
                <span className="truncate max-w-[80px]">{name}</span>
                <span className="font-mono font-semibold text-foreground/80 tabular-nums">{count}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Segment list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="py-1">
          {segments.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground/60 leading-relaxed">
              No segments detected.<br />
              <span className="text-muted-foreground/40">Inference output appears here as the I-Plane finishes processing.</span>
            </div>
          ) : (
            segments.map((seg, idx) => {
              const c = getSegmentColor(seg.label);
              const isCurrent = idx === currentSegmentIndex;
              const dur = fmtDur(seg.t_start_s, seg.t_end_s);
              const name = displayLabel(seg.label);

              return (
                <button
                  key={idx}
                  onClick={() => onSegmentClick(seg, idx)}
                  title={`Jump to ${name.toLowerCase()} at ${fmtSec(seg.t_start_s)} (${dur} duration)`}
                  className={cn(
                    "w-full text-left flex items-stretch gap-0 transition-colors",
                    "hover:bg-muted/40",
                    isCurrent && "bg-primary/8",
                  )}
                >
                  {/* Left color accent bar */}
                  <div
                    className="w-0.5 shrink-0 my-0.5 rounded-r"
                    style={{ background: isCurrent ? c.border : "transparent" }}
                  />
                  <div className="flex-1 min-w-0 px-2.5 py-1.5">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span
                        className="text-[11px] font-semibold leading-tight truncate"
                        style={{ color: c.border }}
                      >
                        {name}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0 tabular-nums">
                        {dur}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/70 tabular-nums">
                      <span title="Start time">{fmtSec(seg.t_start_s)}</span>
                      {seg.score != null && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span title="Model confidence">{(seg.score * 100).toFixed(0)}% confidence</span>
                        </>
                      )}
                      {seg.channel_index != null && (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span title="Channel index">Channel {seg.channel_index}</span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Footer: keyboard hints — full word, not just "prev"/"next" */}
      <div className="flex items-center justify-center gap-4 px-3 py-1.5 border-t border-border/30 text-[10px] text-muted-foreground/60">
        <span className="flex items-center gap-1">
          <kbd className="px-1 py-px bg-muted/80 rounded text-[9px] font-mono">P</kbd>
          <span>previous</span>
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1 py-px bg-muted/80 rounded text-[9px] font-mono">N</kbd>
          <span>next</span>
        </span>
      </div>
    </div>
  );
}
