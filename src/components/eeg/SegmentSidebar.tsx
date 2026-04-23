import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronRight, List } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Segment {
  t_start_s: number;
  t_end_s: number;
  label: string;
  channel_index?: number | null;
  score?: number | null;
}

// Label to color mapping
export const SEGMENT_LABEL_COLORS: Record<string, { bg: string; border: string; badge: string }> = {
  seizure: { bg: "rgba(239, 68, 68, 0.2)", border: "rgba(239, 68, 68, 0.7)", badge: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30" },
  spike: { bg: "rgba(249, 115, 22, 0.2)", border: "rgba(249, 115, 22, 0.7)", badge: "bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30" },
  artifact: { bg: "rgba(234, 179, 8, 0.2)", border: "rgba(234, 179, 8, 0.7)", badge: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30" },
  noisy_channel: { bg: "rgba(234, 179, 8, 0.15)", border: "rgba(234, 179, 8, 0.6)", badge: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30" },
  sleep_spindle: { bg: "rgba(168, 85, 247, 0.2)", border: "rgba(168, 85, 247, 0.7)", badge: "bg-purple-500/20 text-purple-700 dark:text-purple-400 border-purple-500/30" },
  k_complex: { bg: "rgba(139, 92, 246, 0.2)", border: "rgba(139, 92, 246, 0.7)", badge: "bg-violet-500/20 text-violet-700 dark:text-violet-400 border-violet-500/30" },
  slow_wave: { bg: "rgba(99, 102, 241, 0.2)", border: "rgba(99, 102, 241, 0.7)", badge: "bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 border-indigo-500/30" },
  normal: { bg: "rgba(34, 197, 94, 0.15)", border: "rgba(34, 197, 94, 0.6)", badge: "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30" },
  alpha: { bg: "rgba(34, 197, 94, 0.2)", border: "rgba(34, 197, 94, 0.7)", badge: "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30" },
  beta: { bg: "rgba(6, 182, 212, 0.2)", border: "rgba(6, 182, 212, 0.7)", badge: "bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 border-cyan-500/30" },
  theta: { bg: "rgba(20, 184, 166, 0.2)", border: "rgba(20, 184, 166, 0.7)", badge: "bg-teal-500/20 text-teal-700 dark:text-teal-400 border-teal-500/30" },
  delta: { bg: "rgba(59, 130, 246, 0.2)", border: "rgba(59, 130, 246, 0.7)", badge: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30" },
};

const DEFAULT_COLOR = { bg: "rgba(148, 163, 184, 0.15)", border: "rgba(148, 163, 184, 0.5)", badge: "bg-slate-500/20 text-slate-700 dark:text-slate-400 border-slate-500/30" };

export function getSegmentColor(label: string) {
  const lowerLabel = label.toLowerCase();
  // Check for exact match first
  if (SEGMENT_LABEL_COLORS[lowerLabel]) {
    return SEGMENT_LABEL_COLORS[lowerLabel];
  }
  // Check for partial matches
  for (const [key, color] of Object.entries(SEGMENT_LABEL_COLORS)) {
    if (lowerLabel.includes(key) || key.includes(lowerLabel)) {
      return color;
    }
  }
  return DEFAULT_COLOR;
}

interface SegmentSidebarProps {
  segments: Segment[];
  currentSegmentIndex: number;
  isOpen: boolean;
  onToggle: () => void;
  onSegmentClick: (segment: Segment, index: number) => void;
}

export function SegmentSidebar({
  segments,
  currentSegmentIndex,
  isOpen,
  onToggle,
  onSegmentClick,
}: SegmentSidebarProps) {
  // Group segments by label for summary
  const labelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const seg of segments) {
      counts[seg.label] = (counts[seg.label] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [segments]);

  // Collapsed: do not reserve flex width — parent is `relative` so waveforms use full width.
  if (!isOpen) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="icon"
        onClick={onToggle}
        title={`Segments (${segments.length})`}
        className="absolute right-2 top-1/2 z-20 h-9 w-9 -translate-y-1/2 rounded-md border border-border/60 bg-background/95 shadow-md backdrop-blur-sm"
      >
        <List className="h-4 w-4" />
        {segments.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-medium text-primary-foreground">
            {segments.length > 99 ? "99+" : segments.length}
          </span>
        )}
      </Button>
    );
  }

  return (
    <div className="w-64 h-full flex flex-col border-l bg-background">
      {/* Header */}
      <div className="p-2 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <List className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Segments</span>
          <Badge variant="secondary" className="text-xs">
            {segments.length}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="h-6 w-6 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Label summary */}
      {labelCounts.length > 0 && (
        <div className="p-2 border-b flex flex-wrap gap-1">
          {labelCounts.slice(0, 5).map(([label, count]) => {
            const color = getSegmentColor(label);
            return (
              <Badge
                key={label}
                variant="outline"
                className={cn("text-xs", color.badge)}
              >
                {label}: {count}
              </Badge>
            );
          })}
          {labelCounts.length > 5 && (
            <Badge variant="outline" className="text-xs">
              +{labelCounts.length - 5} more
            </Badge>
          )}
        </div>
      )}

      {/* Segment list */}
      <ScrollArea className="flex-1">
        <div className="p-1">
          {segments.map((seg, idx) => {
            const color = getSegmentColor(seg.label);
            const isCurrent = idx === currentSegmentIndex;
            
            return (
              <button
                key={idx}
                onClick={() => onSegmentClick(seg, idx)}
                className={cn(
                  "w-full text-left p-2 rounded-md mb-1 transition-colors",
                  "hover:bg-muted/50",
                  isCurrent && "bg-primary/10 ring-1 ring-primary/30"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: color.border }}
                  />
                  <Badge
                    variant="outline"
                    className={cn("text-xs", color.badge)}
                  >
                    {seg.label}
                  </Badge>
                  {isCurrent && (
                    <span className="text-xs text-primary ml-auto">▸</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground font-mono pl-4">
                  {seg.t_start_s.toFixed(2)}s – {seg.t_end_s.toFixed(2)}s
                </div>
                {(seg.channel_index != null || seg.score != null) && (
                  <div className="text-xs text-muted-foreground pl-4 flex gap-2">
                    {seg.channel_index != null && <span>Ch: {seg.channel_index}</span>}
                    {seg.score != null && <span>Score: {seg.score.toFixed(2)}</span>}
                  </div>
                )}
              </button>
            );
          })}
          
          {segments.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No segments loaded
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Keyboard hints */}
      <div className="p-2 border-t text-xs text-muted-foreground text-center">
        <kbd className="px-1 py-0.5 bg-muted rounded">P</kbd> prev
        {" • "}
        <kbd className="px-1 py-0.5 bg-muted rounded">N</kbd> next
      </div>
    </div>
  );
}
