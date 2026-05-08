import posthog from "posthog-js";

const PH_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const PH_HOST = import.meta.env.VITE_POSTHOG_HOST as string | undefined ?? "https://app.posthog.com";

let initialized = false;

export function initAnalytics() {
  if (initialized || !PH_KEY) return;
  posthog.init(PH_KEY, {
    api_host: PH_HOST,
    capture_pageview: true,
    autocapture: false,       // manual only — keeps event volume clean
    persistence: "localStorage",
    disable_session_recording: false,
  });
  initialized = true;
}

export function identifyUser(userId: string, props?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.identify(userId, props);
}

export function resetIdentity() {
  if (!initialized) return;
  posthog.reset();
}

export function track(event: string, props?: Record<string, unknown>) {
  if (!initialized) return;
  posthog.capture(event, props);
}

// ── Typed event helpers ───────────────────────────────────────────────────────

export const analytics = {
  studyUploaded:     (studyId: string, sla: string)           => track("study_uploaded",      { study_id: studyId, sla }),
  triageStarted:     (studyId: string, sla: string, tokens: number) => track("triage_started", { study_id: studyId, sla, tokens }),
  reportViewed:      (studyId: string, reportId: string)      => track("report_viewed",        { study_id: studyId, report_id: reportId }),
  reportSigned:      (studyId: string, reportId: string)      => track("report_signed",        { study_id: studyId, report_id: reportId }),
  tokensPurchased:   (tokens: number, priceInr: number)       => track("tokens_purchased",     { tokens, price_inr: priceInr }),
  eegViewerOpened:   (studyId: string)                        => track("eeg_viewer_opened",    { study_id: studyId }),
  montageChanged:    (from: string, to: string)               => track("montage_changed",      { from, to }),
  notchChanged:      (hz: number)                             => track("notch_changed",        { hz }),
  pipelineRetried:   (studyId: string)                        => track("pipeline_retried",     { study_id: studyId }),
};
