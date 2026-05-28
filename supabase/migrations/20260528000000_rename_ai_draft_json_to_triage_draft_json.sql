-- Purge 'ai' from the studies schema.
--
-- 1. Rename studies.ai_draft_json → studies.triage_draft_json (additive +
--    bidirectional trigger so unmigrated backend writers keep working).
-- 2. Rename studies.ai_draft_text → studies.triage_draft_text (same pattern).
-- 3. Rename reports.ai_draft     → reports.triage_draft   (same pattern).
-- 4. Rename the study_state enum value 'ai_draft' → 'triage_draft' (atomic
--    label rename; existing rows automatically appear as 'triage_draft').
-- 5. Rename leftover FK constraint ai_drafts_study_id_fkey → report_drafts_*
--    (left over from a prior table rename).
-- 6. Drop the obsolete 4-arg overload of consume_credit_and_sign so the
--    PostgREST ambiguity ("Could not choose the best candidate function")
--    can't recur. The 5-arg overload (with p_request_id) is canonical.
--
-- Frontend reads/writes the new columns starting in this branch. The OLD
-- columns are NOT dropped here — that happens in a follow-up migration
-- after every backend writer is updated.

-- ─── 1+2. studies.ai_draft_json / ai_draft_text → triage_draft_* ──────────
ALTER TABLE public.studies
  ADD COLUMN IF NOT EXISTS triage_draft_json jsonb,
  ADD COLUMN IF NOT EXISTS triage_draft_text text;

UPDATE public.studies
   SET triage_draft_json = ai_draft_json
 WHERE ai_draft_json IS NOT NULL
   AND triage_draft_json IS NULL;

UPDATE public.studies
   SET triage_draft_text = ai_draft_text
 WHERE ai_draft_text IS NOT NULL
   AND triage_draft_text IS NULL;

CREATE OR REPLACE FUNCTION public.sync_triage_draft_cols()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.ai_draft_json IS NOT NULL AND NEW.triage_draft_json IS NULL THEN
      NEW.triage_draft_json := NEW.ai_draft_json;
    ELSIF NEW.triage_draft_json IS NOT NULL AND NEW.ai_draft_json IS NULL THEN
      NEW.ai_draft_json := NEW.triage_draft_json;
    END IF;
    IF NEW.ai_draft_text IS NOT NULL AND NEW.triage_draft_text IS NULL THEN
      NEW.triage_draft_text := NEW.ai_draft_text;
    ELSIF NEW.triage_draft_text IS NOT NULL AND NEW.ai_draft_text IS NULL THEN
      NEW.ai_draft_text := NEW.triage_draft_text;
    END IF;
  ELSE
    IF NEW.ai_draft_json IS DISTINCT FROM OLD.ai_draft_json THEN
      NEW.triage_draft_json := NEW.ai_draft_json;
    ELSIF NEW.triage_draft_json IS DISTINCT FROM OLD.triage_draft_json THEN
      NEW.ai_draft_json := NEW.triage_draft_json;
    END IF;
    IF NEW.ai_draft_text IS DISTINCT FROM OLD.ai_draft_text THEN
      NEW.triage_draft_text := NEW.ai_draft_text;
    ELSIF NEW.triage_draft_text IS DISTINCT FROM OLD.triage_draft_text THEN
      NEW.ai_draft_text := NEW.triage_draft_text;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_triage_draft_cols ON public.studies;
CREATE TRIGGER trg_sync_triage_draft_cols
  BEFORE INSERT OR UPDATE ON public.studies
  FOR EACH ROW EXECUTE FUNCTION public.sync_triage_draft_cols();

COMMENT ON COLUMN public.studies.triage_draft_json IS
  'Pre-fill payload (mind.report.v1 schema) from triage. Replaces ai_draft_json.';
COMMENT ON COLUMN public.studies.triage_draft_text IS
  'Pre-fill prose from triage. Replaces ai_draft_text.';
COMMENT ON COLUMN public.studies.ai_draft_json IS
  'DEPRECATED — use triage_draft_json. Trigger mirrors writes during transition.';
COMMENT ON COLUMN public.studies.ai_draft_text IS
  'DEPRECATED — use triage_draft_text. Trigger mirrors writes during transition.';

-- ─── 3. reports.ai_draft → reports.triage_draft ───────────────────────────
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS triage_draft jsonb;

UPDATE public.reports
   SET triage_draft = ai_draft
 WHERE ai_draft IS NOT NULL
   AND triage_draft IS NULL;

CREATE OR REPLACE FUNCTION public.sync_reports_triage_draft()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.ai_draft IS NOT NULL AND NEW.triage_draft IS NULL THEN
      NEW.triage_draft := NEW.ai_draft;
    ELSIF NEW.triage_draft IS NOT NULL AND NEW.ai_draft IS NULL THEN
      NEW.ai_draft := NEW.triage_draft;
    END IF;
  ELSE
    IF NEW.ai_draft IS DISTINCT FROM OLD.ai_draft THEN
      NEW.triage_draft := NEW.ai_draft;
    ELSIF NEW.triage_draft IS DISTINCT FROM OLD.triage_draft THEN
      NEW.ai_draft := NEW.triage_draft;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_reports_triage_draft ON public.reports;
CREATE TRIGGER trg_sync_reports_triage_draft
  BEFORE INSERT OR UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.sync_reports_triage_draft();

COMMENT ON COLUMN public.reports.triage_draft IS
  'Pre-fill payload from triage. Replaces ai_draft.';
COMMENT ON COLUMN public.reports.ai_draft IS
  'DEPRECATED — use triage_draft. Trigger mirrors writes during transition.';

-- ─── 4. Atomic enum-value rename: study_state ai_draft → triage_draft ────
-- ALTER TYPE RENAME VALUE is atomic and works without rewriting rows. After
-- this, every existing row that was 'ai_draft' appears as 'triage_draft'.
-- IMPORTANT: backend writers that still emit the string 'ai_draft' will
-- fail after this runs. Update generate_triage_report and any iplane/cplane
-- writers to emit 'triage_draft' in lock-step. (Frontend already migrated.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
     WHERE t.typname = 'study_state' AND e.enumlabel = 'ai_draft'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
     WHERE t.typname = 'study_state' AND e.enumlabel = 'triage_draft'
  ) THEN
    ALTER TYPE public.study_state RENAME VALUE 'ai_draft' TO 'triage_draft';
  END IF;
END
$$;

-- ─── 5. Leftover FK constraint name ───────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_drafts_study_id_fkey') THEN
    ALTER TABLE public.report_drafts
      RENAME CONSTRAINT ai_drafts_study_id_fkey
      TO report_drafts_study_id_fkey;
  END IF;
END
$$;

-- ─── 6. Drop the obsolete 4-arg overload of consume_credit_and_sign ──────
-- The 5-arg version (with p_request_id text DEFAULT NULL) supersedes it.
-- Keeping both makes a 4-arg call ambiguous → PostgREST 300 error:
--   "Could not choose the best candidate function between …"
-- Safe to drop because every known caller passes p_request_id (StudyReview
-- + the v2 Sign tab in StudyDetail).
DROP FUNCTION IF EXISTS public.consume_credit_and_sign(uuid, uuid, integer, jsonb);
