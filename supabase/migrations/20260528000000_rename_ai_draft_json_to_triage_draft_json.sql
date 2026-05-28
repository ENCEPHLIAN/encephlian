-- Rename studies.ai_draft_* → studies.triage_draft_*
--
-- Additive migration. Adds new columns triage_draft_json and triage_draft_text,
-- backfills from the old ai_draft_* columns, and installs a bidirectional
-- trigger so backend writers (iplane, cplane, edge functions) that still
-- write to the old columns continue working during the transition.
-- The old columns are NOT dropped here — that happens after every backend
-- writer is updated.
--
-- Frontend reads/writes the new columns starting in commit:
--   rename(no-ai): studies.ai_draft_* -> studies.triage_draft_*
--
-- To complete the rename (run after all backend writers have migrated):
--   DROP TRIGGER  IF EXISTS trg_sync_triage_draft_cols ON public.studies;
--   DROP FUNCTION IF EXISTS public.sync_triage_draft_cols();
--   ALTER TABLE   public.studies DROP COLUMN ai_draft_json;
--   ALTER TABLE   public.studies DROP COLUMN ai_draft_text;

-- Phase 1: new columns.
ALTER TABLE public.studies
  ADD COLUMN IF NOT EXISTS triage_draft_json jsonb,
  ADD COLUMN IF NOT EXISTS triage_draft_text text;

-- Phase 2: backfill from the old columns.
UPDATE public.studies
   SET triage_draft_json = ai_draft_json
 WHERE ai_draft_json IS NOT NULL
   AND triage_draft_json IS NULL;

UPDATE public.studies
   SET triage_draft_text = ai_draft_text
 WHERE ai_draft_text IS NOT NULL
   AND triage_draft_text IS NULL;

-- Phase 3: trigger to mirror writes in both directions during transition.
-- Frontend writes triage_draft_*; backend writers may still write
-- ai_draft_* until they migrate. Either side stays in sync.
CREATE OR REPLACE FUNCTION public.sync_triage_draft_cols()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- JSON column
  IF TG_OP = 'INSERT' THEN
    IF NEW.ai_draft_json IS NOT NULL AND NEW.triage_draft_json IS NULL THEN
      NEW.triage_draft_json := NEW.ai_draft_json;
    ELSIF NEW.triage_draft_json IS NOT NULL AND NEW.ai_draft_json IS NULL THEN
      NEW.ai_draft_json := NEW.triage_draft_json;
    END IF;
  ELSE
    IF NEW.ai_draft_json IS DISTINCT FROM OLD.ai_draft_json THEN
      NEW.triage_draft_json := NEW.ai_draft_json;
    ELSIF NEW.triage_draft_json IS DISTINCT FROM OLD.triage_draft_json THEN
      NEW.ai_draft_json := NEW.triage_draft_json;
    END IF;
  END IF;

  -- Text column
  IF TG_OP = 'INSERT' THEN
    IF NEW.ai_draft_text IS NOT NULL AND NEW.triage_draft_text IS NULL THEN
      NEW.triage_draft_text := NEW.ai_draft_text;
    ELSIF NEW.triage_draft_text IS NOT NULL AND NEW.ai_draft_text IS NULL THEN
      NEW.ai_draft_text := NEW.triage_draft_text;
    END IF;
  ELSE
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
  'Pre-fill payload (mind.report.v1 schema) produced by I-Plane after triage. Replaces ai_draft_json (dropped in a later migration after backend writers migrate).';

COMMENT ON COLUMN public.studies.triage_draft_text IS
  'Pre-fill prose text from triage. Replaces ai_draft_text.';

COMMENT ON COLUMN public.studies.ai_draft_json IS
  'DEPRECATED — use triage_draft_json. Trigger mirrors writes during transition.';

COMMENT ON COLUMN public.studies.ai_draft_text IS
  'DEPRECATED — use triage_draft_text. Trigger mirrors writes during transition.';

-- ─── Bonus: state value rename ─────────────────────────────────────────
-- studies.state contained the legacy value 'ai_draft' (used to mean
-- 'triage produced a draft, ready for clinician review'). Rename the
-- value following the same no-AI-in-names rule.
--
-- Trigger normalizes any new writes from backend writers still using
-- the old value. Existing rows backfilled below.
CREATE OR REPLACE FUNCTION public.normalize_legacy_state_values()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.state = 'ai_draft' THEN
    NEW.state := 'triage_draft';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_legacy_state_values ON public.studies;
CREATE TRIGGER trg_normalize_legacy_state_values
  BEFORE INSERT OR UPDATE OF state ON public.studies
  FOR EACH ROW EXECUTE FUNCTION public.normalize_legacy_state_values();

UPDATE public.studies
   SET state = 'triage_draft'
 WHERE state = 'ai_draft';

-- ─── Leftover FK from the prior ai_drafts → report_drafts table rename ──
-- The table was renamed but the foreign key constraint kept its old name.
-- Rename it for consistency. Defensive DO block so re-runs are safe.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ai_drafts_study_id_fkey'
  ) THEN
    ALTER TABLE public.report_drafts
      RENAME CONSTRAINT ai_drafts_study_id_fkey
      TO report_drafts_study_id_fkey;
  END IF;
END
$$;

