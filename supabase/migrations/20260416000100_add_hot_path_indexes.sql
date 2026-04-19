-- 20260416000100_add_hot_path_indexes.sql
-- Part of the 2026-04-16 tightening audit.
-- All CONCURRENTLY — no table locks, can be applied online.
-- Run each statement individually (CREATE INDEX CONCURRENTLY forbids transactions).

-- Study lists per clinic, sorted by recency (Studies, Dashboard, CommandPalette)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_studies_clinic_created
  ON public.studies (clinic_id, created_at DESC);

-- Triage dashboards (only index rows that need attention)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_studies_triage_status
  ON public.studies (triage_status)
  WHERE triage_status IN ('pending','running','failed');

-- AI drafts newest-first per study (StudyReview)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_drafts_study_created
  ON public.ai_drafts (study_id, created_at DESC);

-- Audit logs filtered by event type + time (AdminAuditLogs, AdminUsers)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_type_created
  ON public.audit_logs (event_type, created_at DESC);

-- Wallet history per user (Wallet, PilotWalletCard, AdminWallets)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_tx_user_created
  ON public.wallet_transactions (user_id, created_at DESC);

-- Note: idx_reports_study_id skipped — reports_study_id_key (UNIQUE) already covers it.
