import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
type StudyRow = {
  state?: string | null;
  triage_status?: string | null;
  triage_progress?: number | null;
  tokens_deducted?: number | null;
  sla_selected_at?: string | null;
};

const INTERNAL_STEPS = [
  { key: "upload", label: "Upload", detail: "File received" },
  { key: "sla", label: "SLA & tokens", detail: "Standard (1) or Priority (2) — wallet charged here" },
  { key: "triage", label: "Triage pipeline", detail: "C-Plane + MIND® analysis" },
  { key: "draft", label: "Draft ready", detail: "ESF / SCORE available for review" },
  { key: "signed", label: "Signed", detail: "Final report — no extra token charge" },
] as const;

const PILOT_STEPS = [
  { key: "upload", label: "Uploaded" },
  { key: "sla", label: "Priority" },
  { key: "triage", label: "Analysis" },
  { key: "draft", label: "Report" },
  { key: "signed", label: "Done" },
] as const;

function stepIndex(study: StudyRow): number {
  const st = study.state || "";
  if (st === "signed") return 4;
  if (["ai_draft", "in_review", "complete", "completed"].includes(st)) return 3;
  if (st === "processing" || study.triage_status === "processing") return 2;
  if (st === "awaiting_sla" || st === "uploaded") return 1;
  /* parsed / preprocessed / failed recovery: treat as pipeline in motion */
  return 2;
}

export function StudyFlowProgress({ study, isPilot }: { study: StudyRow; isPilot: boolean }) {
  const active = stepIndex(study);
  const steps = isPilot ? PILOT_STEPS : INTERNAL_STEPS;

  return (
    <div className="rounded-lg border bg-card/50 p-4">
      <p className={cn("text-xs font-medium mb-3", isPilot ? "text-muted-foreground" : "text-foreground")}>
        {isPilot ? "Status" : "Study pipeline"}
      </p>
      <ol className="flex flex-wrap gap-2 sm:gap-0 sm:flex-nowrap sm:justify-between">
        {steps.map((s, i) => {
          const done = i < active;
          const current = i === active;
          return (
            <li
              key={s.key}
              className={cn(
                "flex flex-1 min-w-[4.5rem] flex-col items-center text-center gap-1 rounded-md px-1 py-2 sm:py-1",
                done && "text-emerald-600",
                current && !done && "bg-primary/10 text-primary ring-1 ring-primary/20",
                !done && !current && "text-muted-foreground opacity-70",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold border",
                  done && "bg-emerald-500/15 border-emerald-500/40",
                  current && !done && "bg-primary text-primary-foreground border-primary",
                  !done && !current && "border-border bg-muted/40",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="text-[10px] sm:text-xs font-medium leading-tight">{s.label}</span>
              {!isPilot && "detail" in s && (
                <span className="hidden lg:block text-[10px] text-muted-foreground leading-snug max-w-[7rem]">
                  {s.detail}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {!isPilot && study.triage_status === "processing" && (
        <p className="text-xs text-muted-foreground mt-3">
          Progress {study.triage_progress ?? 0}% — preprocessing, MIND® scoring, and report assembly run on the
          server; this page refreshes automatically.
        </p>
      )}
      {isPilot && study.triage_status === "processing" && (
        <p className="text-xs text-muted-foreground mt-2 tabular-nums">{study.triage_progress ?? 0}%</p>
      )}
    </div>
  );
}
