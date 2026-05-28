import { useState } from "react";
import { ThumbsDown, Check, Loader2, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const REJECT_REASONS = [
  { code: "artifact",           label: "Artifact / noise" },
  { code: "wrong_lateralization", label: "Wrong lateralization" },
  { code: "missed_finding",     label: "Missed finding" },
  { code: "spurious_finding",   label: "Spurious finding" },
  { code: "other",              label: "Other" },
] as const;

export type RejectReasonCode = typeof REJECT_REASONS[number]["code"];

export interface RejectFindingProps {
  studyId: string;
  fieldId: string;             // stable v2 field_id, e.g. "ictal.seizure_events"
  fieldLabel: string;          // human label e.g. "Seizure detection"
  className?: string;
  onRejected?: (code: RejectReasonCode, text: string) => void;
}

/**
 * One-tap reject affordance for an AI block (Internal SKU). Persists to
 * audit_logs with event_type='clinician_reject' and event_data carrying
 * field_id + reason_code + optional free-text. Per-clinician override rate
 * is computed downstream from these rows (RejectFinding doesn't track it).
 *
 * Pattern lifted from Glass/Abridge: tiny ghost button beside the finding,
 * popover for reason, persists then collapses.
 */
export function RejectFinding({
  studyId,
  fieldId,
  fieldLabel,
  className,
  onRejected,
}: RejectFindingProps) {
  const [open, setOpen] = useState(false);
  const [selectedCode, setSelectedCode] = useState<RejectReasonCode | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!selectedCode) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: insErr } = await supabase.from("audit_logs").insert({
        event_type: "clinician_reject",
        action: "reject_finding",
        resource_type: "study",
        resource_id: studyId,
        user_id: user?.id ?? null,
        event_data: {
          field_id: fieldId,
          field_label: fieldLabel,
          reason_code: selectedCode,
          reason_text: reasonText.trim() || null,
        },
      });
      if (insErr) throw insErr;
      setSubmitted(true);
      onRejected?.(selectedCode, reasonText.trim());
      setTimeout(() => {
        setOpen(false);
        // Reset after close animation
        setTimeout(() => {
          setSubmitted(false);
          setSelectedCode(null);
          setReasonText("");
        }, 200);
      }, 1200);
    } catch (e: any) {
      setError(e?.message ?? "Could not record rejection.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { if (!submitting) setOpen(o); }}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 hover:text-destructive transition-colors",
            className,
          )}
          title={`Reject AI finding: ${fieldLabel}`}
          aria-label={`Reject ${fieldLabel}`}
        >
          <ThumbsDown className="h-3 w-3" />
          <span>Reject</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 space-y-2" align="end" side="top">
        {submitted ? (
          <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 py-2">
            <Check className="h-3.5 w-3.5" />
            <span>Recorded. Thanks.</span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Why reject?
              </span>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground/60 hover:text-foreground"
                aria-label="Cancel"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="space-y-1">
              {REJECT_REASONS.map((r) => (
                <button
                  key={r.code}
                  onClick={() => setSelectedCode(r.code)}
                  className={cn(
                    "w-full text-left text-xs rounded-md border px-2 py-1.5 transition-colors",
                    selectedCode === r.code
                      ? "border-destructive/50 bg-destructive/5 text-foreground"
                      : "border-border/60 hover:bg-muted/40 text-muted-foreground",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {selectedCode === "other" && (
              <Textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                placeholder="Brief note…"
                className="text-xs min-h-[60px]"
              />
            )}
            {error && (
              <p className="text-[10px] text-destructive">{error}</p>
            )}
            <Button
              size="sm"
              variant="destructive"
              className="w-full h-7 text-xs"
              disabled={!selectedCode || submitting || (selectedCode === "other" && !reasonText.trim())}
              onClick={submit}
            >
              {submitting ? (
                <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Recording…</>
              ) : (
                "Record rejection"
              )}
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
