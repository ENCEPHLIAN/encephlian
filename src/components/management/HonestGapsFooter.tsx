/**
 * HonestGapsFooter — Panel G of the per-clinic management dashboard.
 *
 * The honesty-primacy panel. ALWAYS RENDERS, even on cold-start, so the
 * dashboard's audit-trail-of-itself can never be empty (design §3 Panel G).
 * In P0 we ship with a hardcoded default copy bundle covering the known
 * gaps; P1 swaps in editable copy from a `dashboard_honest_gaps` table.
 *
 * The structural rule (postmortem-vigil-clean §systemic root cause): the
 * failure mode is *silently presenting an estimate as a measurement.* This
 * panel inverts that: explicitly lists what we are NOT showing and why.
 *
 * Spec: docs/per_clinic_ops_dashboard_design.md §3 Panel G.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { Info, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface HonestGap {
  id: string;
  title: string;
  body: string;
  link?: { href: string; label: string };
}

// P0 default copy bundle. Each entry maps to a real, currently-known gap.
// Editing happens in code review until the P1 dashboard_honest_gaps table
// lands; once it does, this constant becomes the seed.
const DEFAULT_GAPS: HonestGap[] = [
  {
    id: "vigil-deprecated",
    title: "Per-channel quality estimator (VIGIL) is deprecated",
    body:
      "VIGIL was retired on 2026-05-31 because the trained model diverged from the published paper. Per-channel quality is currently computed by a deterministic rule fallback while a replacement is in training. The Signal Quality panel above reflects rule-fallback output, not a learned estimator.",
    link: { href: "/admin/models", label: "Model status" },
  },
  {
    id: "aria-vertex-planned",
    title: "ARIA and VERTEX heads are not yet serving",
    body:
      "MIND Triage v3 has been validated and is currently serving. ARIA (artifact rejection) and VERTEX (vertex-wave specialist) heads are planned but not yet trained — anywhere a report mentions them, the source is the deterministic rule fallback.",
    link: { href: "/admin/models", label: "Models page" },
  },
  {
    id: "edit-delta-aggregation",
    title: "Edit-delta rate is not yet broken out by finding kind",
    body:
      "When clinicians edit or reject a triage draft we log the delta, but the dashboard aggregates across all findings. Per-(model_family, finding_kind) breakouts will land with Panel D (Clinician Utilization) in P1.",
  },
  {
    id: "cross-clinic-benchmark",
    title: "Cross-clinic benchmark is not yet available",
    body:
      "A 'how do you compare to other clinics in your tier' panel will land in P2. It will return anonymized buckets only; we will never disclose another clinic's identity to you.",
  },
];

interface HonestGapsFooterProps {
  /** Override the default bundle (used when P1 fetches editable copy). */
  gaps?: HonestGap[];
}

export default function HonestGapsFooter({ gaps = DEFAULT_GAPS }: HonestGapsFooterProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className="rounded-lg border border-border/60 bg-muted/10 p-4 space-y-3">
      <header className="flex items-center gap-2">
        <Info className="h-3.5 w-3.5 text-muted-foreground" />
        <h2 className="text-sm font-medium">What we don't know yet</h2>
        <span className="text-[10px] text-muted-foreground/60 font-mono tabular-nums ml-auto">
          {gaps.length} gap{gaps.length === 1 ? "" : "s"}
        </span>
      </header>
      <p className="text-[11px] text-muted-foreground/80 leading-snug">
        This panel lists data this dashboard is NOT showing you, and why. We surface gaps
        explicitly so an estimate is never silently presented as a measurement.
      </p>
      <ul className="space-y-1.5">
        {gaps.map((gap) => {
          const isOpen = expanded.has(gap.id);
          return (
            <li
              key={gap.id}
              className="rounded-md border border-border/40 bg-background overflow-hidden"
            >
              <button
                onClick={() => toggle(gap.id)}
                className={cn(
                  "w-full flex items-center gap-2 p-2.5 text-left hover:bg-accent/20 transition-colors",
                  isOpen && "bg-accent/10",
                )}
                aria-expanded={isOpen}
              >
                {isOpen ? (
                  <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
                <span className="text-xs font-medium text-foreground/90 flex-1 truncate">
                  {gap.title}
                </span>
              </button>
              {isOpen && (
                <div className="px-2.5 pb-2.5 pt-1 space-y-1.5 border-t border-border/30">
                  <p className="text-[11px] text-muted-foreground leading-snug">{gap.body}</p>
                  {gap.link && (
                    <Link
                      to={gap.link.href}
                      className="inline-block text-[11px] text-primary hover:underline"
                    >
                      {gap.link.label} →
                    </Link>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
