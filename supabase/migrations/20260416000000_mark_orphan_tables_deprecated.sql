-- 20260416000000_mark_orphan_tables_deprecated.sql
-- Part of the 2026-04-16 tightening audit.
-- ADDITIVE ONLY: no DROP, no ALTER, no REVOKE. Pure documentation via COMMENT.
-- Zero runtime impact. Policy signposts for the next 6 months.

COMMENT ON TABLE public.canonical_eeg_records IS 'DEPRECATED 2026-04-16: ESF v1.0 canonical data now lives in Azure Blob eeg-canonical/<study_id>/meta.json + eeg-canonical/<study_id>/data.zarr/. This table was the pre-blob home; read-only audit of legacy rows. No new writes expected from live services.';

COMMENT ON TABLE public.eeg_markers IS 'DEPRECATED 2026-04-16: annotations/markers now live in Azure Blob eeg-derived/<study_id>/annotations.json, served by Read API /studies/{id}/annotations. No new writes expected.';

COMMENT ON TABLE public.study_reports IS 'PARTIAL DEPRECATION 2026-04-16: superseded by blob eeg-reports/<study_id>/report.json plus the signed "reports" table. AdminStudyDetail.tsx still INSERTs here during review. Plan: migrate that write to reports + blob, then drop.';

COMMENT ON TABLE public.report_attachments IS 'RESERVED 2026-04-16: intended for user-uploaded report attachments (imaging, labs, prior reports). Not yet wired to UI.';

COMMENT ON TABLE public.report_templates IS 'RESERVED 2026-04-16: intended for customizable SCORE/triage report templates per clinic. Not yet wired to UI.';

COMMENT ON TABLE public.payments IS 'RESERVED 2026-04-16: intended for Razorpay/Stripe payment records. Not yet wired — wallet top-ups are admin-only today via admin_adjust_tokens.';

COMMENT ON TABLE public.service_health_logs IS 'RESERVED 2026-04-16: intended for persistent service health history. AdminHealth UI currently computes live from /health endpoints; no rows written by live services (15 legacy rows from earlier manual probes).';

COMMENT ON TABLE public.storage_lifecycle_policies IS 'RESERVED 2026-04-16: intended for Azure Blob lifecycle automation. RPC get_files_for_cleanup() reads this, but no UI calls the RPC.';
