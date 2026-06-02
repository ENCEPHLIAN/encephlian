import { toast } from "sonner";

type Severity = "info" | "warning" | "error";

interface FeedbackReport {
  severity: Severity;
  what: string;
  why: string;
  action: string;
  technical?: string;
  duration?: number;
}

/**
 * Centralized, deterministic feedback engine.
 * Every failure gets: (a) what happened, (b) why, (c) what to do next.
 * Raw errors go to console only — clinicians see actionable guidance.
 */
export const systemFeedback = {
  report({ severity, what, why, action, technical, duration }: FeedbackReport) {
    // Always log technical detail to console for debugging
    if (technical) {
      console.error(`[SystemFeedback] ${what}:`, technical);
    }

    const description = `${why}\n\n${action}`;

    switch (severity) {
      case "error":
        toast.error(what, { description, duration: duration ?? 10000 });
        break;
      case "warning":
        toast.warning(what, { description, duration: duration ?? 8000 });
        break;
      case "info":
        toast.info(what, { description, duration: duration ?? 5000 });
        break;
    }
  },

  /** Pre-built reports for common failures */

  fileTooLarge(sizeMB: number) {
    this.report({
      severity: "error",
      what: "File too large",
      why: `Your file is ${sizeMB.toFixed(1)} MB. The maximum upload size is 20 MB.`,
      action: "Try exporting a shorter recording segment, or reduce the number of channels before exporting.",
    });
  },

  noClinicAssigned() {
    this.report({
      severity: "error",
      what: "No clinic assigned to your account",
      why: "Your account must be linked to a clinic before you can upload studies.",
      action: "Contact your administrator to assign you to a clinic.",
    });
  },

  edfHeaderExtractionFailed(error?: string) {
    this.report({
      severity: "warning",
      what: "Could not read file header",
      why: "This sometimes happens with older EEG machines or non-standard file exports.",
      action: "Your file will still be uploaded. Metadata can be entered manually or extracted server-side.",
      technical: error,
    });
  },

  parseEdgeFunctionFailed(error?: string) {
    this.report({
      severity: "warning",
      what: "Automatic analysis did not start",
      why: "File uploaded successfully, but the automatic parsing step did not complete.",
      action: "Your study is saved. An administrator can re-trigger processing if needed.",
      technical: error,
    });
  },

  proprietaryFormatNotice(extension: string) {
    this.report({
      severity: "info",
      what: `Proprietary format (${extension})`,
      why: "This format cannot be automatically analyzed yet. Your file is saved for future processing.",
      action: "For immediate processing, export the recording as EDF from your EEG machine and re-upload.",
      duration: 12000,
    });
  },

  uploadTimeout() {
    this.report({
      severity: "error",
      what: "Upload timed out",
      why: "The file upload did not complete within 60 seconds. This usually indicates a slow or unstable network connection.",
      action: "Please check your internet connection and try again. A wired connection is recommended for large files.",
    });
  },

  uploadFailed(error?: string) {
    this.report({
      severity: "error",
      what: "Upload failed",
      why: "The file could not be uploaded to the server.",
      action: "Check your internet connection and try again. If the problem persists, contact support.",
      technical: error,
    });
  },

  studyCreationFailed(error?: string) {
    this.report({
      severity: "error",
      what: "Study record creation failed",
      why: "Your file was uploaded, but the study record could not be created in the system.",
      action: "Please try again. If the problem persists, contact support with the file name.",
      technical: error,
    });
  },

  dataLoadFailed(context: string, error?: string) {
    this.report({
      severity: "error",
      what: `Could not load ${context}`,
      why: "This could be a network issue or a temporary server problem.",
      action: "Check your connection and click Retry. If the problem persists, refresh the page.",
      technical: error,
    });
  },

  studyNotFound() {
    this.report({
      severity: "error",
      what: "Study not found",
      why: "This study may have been deleted, or you may not have access to it.",
      action: "If you believe this is an error, contact your clinic administrator.",
    });
  },

  /* ------------------------------------------------------------------
   * Failover scenario reports (per docs/failover_ux_design.md §2)
   * Copy is the design doc's verbatim what/why/action triples; the
   * functions take optional context (timestamps, error strings, step
   * names) used to render the `why` and `technical` fields.
   * ----------------------------------------------------------------*/

  /** Scenario 1: C-Plane down during upload (POST /process after blob put). */
  uploadCplaneUnreachable(technical?: string) {
    this.report({
      severity: "warning",
      what: "File saved — analysis service not reachable",
      why: "Your recording is safe in storage. The service that converts it for review is temporarily offline.",
      action: "We'll retry automatically. No need to re-upload.",
      technical,
      duration: 12000,
    });
  },

  /** Scenario 3: I-Plane down after canonicalization succeeded. */
  iplaneDownPostCanonical(elapsedMin?: number) {
    const escalated = typeof elapsedMin === "number" && elapsedMin >= 30;
    this.report({
      severity: escalated ? "error" : "warning",
      what: "Analysis paused — models offline",
      why: "Pre-processing finished. Model inference service is currently unreachable.",
      action: "Your study stays in queue. Results resume automatically when the service returns.",
      technical: typeof elapsedMin === "number" ? `stalled for ${elapsedMin} min` : undefined,
      duration: escalated ? 15000 : 10000,
    });
  },

  /** Scenario 4: Read API down during viewer chunk fetch. */
  readApiDownViewer(technical?: string) {
    this.report({
      severity: "warning",
      what: "Waveform service unreachable",
      why: "We can't load the polished waveform right now.",
      action: "Showing raw EDF preview (lower fidelity). Full viewer returns when the service is back.",
      technical,
      duration: 10000,
    });
  },

  /** Scenario 5: Supabase database unreachable (global). */
  supabaseDownGlobal(lastSyncAgo?: string) {
    const ago = lastSyncAgo ?? "unknown";
    this.report({
      severity: "error",
      what: "Database connection lost",
      why: `Last successful sync: ${ago}. We're showing cached data — newer changes may be missing.`,
      action: "Sign-out, signing, and report saves are disabled until reconnect.",
      duration: 15000,
    });
  },

  /** Scenario 6: Blob storage (canonical zarr) inaccessible. */
  blobStorageDown(technical?: string) {
    this.report({
      severity: "warning",
      what: "Storage layer issue (not your file)",
      why: "Your recording is safe. The canonical waveform storage is temporarily unreachable.",
      action: "Try again in 2 min. We'll recover automatically when storage is back.",
      technical,
      duration: 12000,
    });
  },

  /** Scenario 7: Azure region partial outage — all planes degraded. */
  azureRegionDegraded() {
    this.report({
      severity: "error",
      what: "Cloud region degraded",
      why: "We're tracking the issue. Multiple services in the region are currently unreachable.",
      action: "Your in-progress work is preserved. Avoid new uploads until the banner clears.",
      duration: 20000,
    });
  },

  /** Scenario 8: Auth token expired mid-session and refresh failed. */
  authExpiredMidSession() {
    this.report({
      severity: "warning",
      what: "Session expired",
      why: "Please re-sign in to continue editing.",
      action: "Your changes on this page are kept until you sign back in.",
      duration: 12000,
    });
  },

  /** Scenario 9: Generic Edge function failure (FunctionsHttpError unwrapped). */
  edgeFunctionFailed(fnName: string, error?: string) {
    this.report({
      severity: "error",
      what: `${fnName} did not complete`,
      why: "The service that handles this request returned an error.",
      action: "Try again in 1 min. If the problem persists, copy the diagnostic below and report the issue.",
      technical: error ?? `unknown error from ${fnName}`,
      duration: 12000,
    });
  },

  /** Scenario 3 helper: per-step stalled processing. */
  studyProcessingStalled(stepName: string, elapsedMin: number) {
    const escalated = elapsedMin >= 30;
    this.report({
      severity: escalated ? "error" : "warning",
      what: `Processing stalled at ${stepName}`,
      why: `We've been waiting ${elapsedMin} min for this step. Your file is safe.`,
      action: escalated
        ? "The service may be down. Retry from the study page, or open Support if it persists."
        : "Refresh the page in a minute. The pipeline often recovers on its own.",
      duration: escalated ? 15000 : 10000,
    });
  },
};
