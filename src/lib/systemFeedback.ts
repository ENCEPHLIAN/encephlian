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
};
