-- ENCEPHLIAN honest-output subsystem — Phase 1A foundation
--
-- Builds the persistent contracts that let the platform refuse to assert
-- what it cannot derive (paper §9). Six new tables + a schema registry +
-- a JSONB shape validator on studies.triage_draft_json.
--
-- Design principles encoded here:
--   1. Single source of truth for the report contract (schema_definitions).
--   2. Content-addressable model + payload identity (sha256 columns).
--   3. Append-only audit (clinician_edit_deltas, report_emission_events).
--   4. Versioning per dimension (schema version, model version, calibration
--      run timestamp). Nothing here will silently drift.
--   5. Defense-in-depth: shape-validated by trigger BEFORE writes land.
--   6. RLS scoped per role/clinic on every new table — never bypassed.
--   7. Idempotent: every CREATE/INSERT is gated by IF NOT EXISTS so this
--      migration can be re-applied without effect if it has already run.
--
-- After this lands, frontend reads the contracts from these tables instead
-- of hardcoding model lists or schema versions.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- digest() for sha256

-- ───────────────────────────────────────────────────────────────────────
-- 1. schema_definitions — canonical contracts for report shapes
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.schema_definitions (
  name           text NOT NULL,
  version        text NOT NULL,
  schema         jsonb NOT NULL,
  description    text,
  schema_sha256  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (name, version)
);

CREATE INDEX IF NOT EXISTS schema_definitions_sha_idx
  ON public.schema_definitions (schema_sha256);

CREATE INDEX IF NOT EXISTS schema_definitions_name_idx
  ON public.schema_definitions (name);

COMMENT ON TABLE public.schema_definitions IS
  'Canonical JSON Schemas for every report contract emitted by ENCEPHLIAN. schema_sha256 makes each contract content-addressable so any caller can verify the version they received.';

ALTER TABLE public.schema_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schema_definitions_read" ON public.schema_definitions;
CREATE POLICY "schema_definitions_read"
  ON public.schema_definitions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "schema_definitions_admin_write" ON public.schema_definitions;
CREATE POLICY "schema_definitions_admin_write"
  ON public.schema_definitions FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role));

-- ───────────────────────────────────────────────────────────────────────
-- 2. model_versions — registry of every model and where it lives
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.model_versions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text NOT NULL,
  version                  text NOT NULL,
  family                   text NOT NULL CHECK (family IN (
                             'triage', 'quality', 'cleaning', 'normalization',
                             'foundation', 'finding', 'language', 'heuristic'
                           )),
  status                   text NOT NULL CHECK (status IN (
                             'planned', 'training', 'trained_not_deployed',
                             'deployed_in_blob', 'loaded_in_iplane', 'serving',
                             'deprecated', 'failed'
                           )),
  training_corpus          text,
  validation_metrics       jsonb,
  weights_sha256           text,
  weights_blob_path        text,
  model_card_url           text,
  emits_schema_name        text,
  emits_schema_version     text,
  deployed_at              timestamptz,
  deprecated_at            timestamptz,
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (name, version),
  FOREIGN KEY (emits_schema_name, emits_schema_version)
    REFERENCES public.schema_definitions (name, version)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS model_versions_name_idx
  ON public.model_versions (name);

CREATE INDEX IF NOT EXISTS model_versions_status_idx
  ON public.model_versions (status) WHERE status IN ('serving', 'loaded_in_iplane');

COMMENT ON TABLE public.model_versions IS
  'Every model the system knows about. Status is the deploy ladder: planned → training → trained_not_deployed → deployed_in_blob → loaded_in_iplane → serving. Use weights_sha256 to verify identity end-to-end.';

ALTER TABLE public.model_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "model_versions_read" ON public.model_versions;
CREATE POLICY "model_versions_read"
  ON public.model_versions FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "model_versions_admin_write" ON public.model_versions;
CREATE POLICY "model_versions_admin_write"
  ON public.model_versions FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role));

-- ───────────────────────────────────────────────────────────────────────
-- 3. model_calibration_runs — per-model-per-day reliability metrics
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.model_calibration_runs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_version_id       uuid NOT NULL REFERENCES public.model_versions(id) ON DELETE CASCADE,
  measured_at            timestamptz NOT NULL DEFAULT now(),
  holdout_set_label      text NOT NULL,           -- e.g. 'tuab_v3_holdout_2026q2'
  n_samples              integer NOT NULL CHECK (n_samples > 0),
  ece                    numeric CHECK (ece >= 0),
  brier_score            numeric CHECK (brier_score >= 0),
  platt_a                numeric,
  platt_b                numeric,
  reliability_diagram    jsonb,                   -- {bins: [{pred, actual, n}, ...]}
  threshold_metrics      jsonb,                   -- {sensitivity, specificity, ppv, npv at chosen ops point}
  notes                  text,
  measured_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS model_calibration_runs_model_idx
  ON public.model_calibration_runs (model_version_id, measured_at DESC);

COMMENT ON TABLE public.model_calibration_runs IS
  'Per-model calibration measurements. ece = expected calibration error. platt_a/b = Platt scaling coefficients applied to raw confidence at the read boundary. Stored per holdout set so historical drift is visible.';

ALTER TABLE public.model_calibration_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calibration_runs_read" ON public.model_calibration_runs;
CREATE POLICY "calibration_runs_read"
  ON public.model_calibration_runs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "calibration_runs_admin_write" ON public.model_calibration_runs;
CREATE POLICY "calibration_runs_admin_write"
  ON public.model_calibration_runs FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role));

-- ───────────────────────────────────────────────────────────────────────
-- 4. channel_quality_assessments — VIGIL output, scoped per study
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.channel_quality_assessments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id            uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  channel_label       text NOT NULL,
  source              text NOT NULL,                 -- 'vigil_v1', 'rule_threshold_v1', etc.
  source_version      text,
  source_model_id     uuid REFERENCES public.model_versions(id) ON DELETE SET NULL,
  quality_class       text NOT NULL CHECK (quality_class IN ('good', 'degraded', 'bad', 'missing')),
  confidence          numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  details             jsonb,
  assessed_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (study_id, channel_label, source, source_version)
);

CREATE INDEX IF NOT EXISTS channel_quality_study_idx
  ON public.channel_quality_assessments (study_id);

CREATE INDEX IF NOT EXISTS channel_quality_bad_idx
  ON public.channel_quality_assessments (study_id)
  WHERE quality_class IN ('bad', 'missing');

COMMENT ON TABLE public.channel_quality_assessments IS
  'Per-channel quality from VIGIL (or the rule fallback). The channel-dependency gate in §9 reads this to decide whether a finding may be asserted. Unique on (study, channel, source) so multiple sources can coexist for the same channel.';

ALTER TABLE public.channel_quality_assessments ENABLE ROW LEVEL SECURITY;

-- Read access mirrors studies access (per clinic). We piggyback on the
-- existing studies RLS via an EXISTS check rather than duplicating policies.
DROP POLICY IF EXISTS "channel_quality_read" ON public.channel_quality_assessments;
CREATE POLICY "channel_quality_read"
  ON public.channel_quality_assessments FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.studies s
    WHERE s.id = channel_quality_assessments.study_id
  ));

DROP POLICY IF EXISTS "channel_quality_admin_write" ON public.channel_quality_assessments;
CREATE POLICY "channel_quality_admin_write"
  ON public.channel_quality_assessments FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role));

-- ───────────────────────────────────────────────────────────────────────
-- 5. report_emission_events — append-only emission audit
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.report_emission_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id            uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  emitted_by          text NOT NULL,           -- 'iplane:9375a0b', 'edge:promote_v2', 'rule:score_v1'
  emitted_at          timestamptz NOT NULL DEFAULT now(),
  schema_name         text NOT NULL,
  schema_version      text NOT NULL,
  model_version_id    uuid REFERENCES public.model_versions(id) ON DELETE SET NULL,
  payload_sha256      text NOT NULL,
  payload_preview     jsonb,                    -- top-level keys only, never the full payload
  request_id          text,
  superseded_by       uuid REFERENCES public.report_emission_events(id) ON DELETE SET NULL,
  FOREIGN KEY (schema_name, schema_version)
    REFERENCES public.schema_definitions (name, version)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS emission_events_study_idx
  ON public.report_emission_events (study_id, emitted_at DESC);

CREATE INDEX IF NOT EXISTS emission_events_sha_idx
  ON public.report_emission_events (payload_sha256);

CREATE INDEX IF NOT EXISTS emission_events_request_idx
  ON public.report_emission_events (request_id) WHERE request_id IS NOT NULL;

COMMENT ON TABLE public.report_emission_events IS
  'Append-only log of every report payload emitted for a study. payload_sha256 makes the payload content-addressable. superseded_by chains later emissions to earlier ones so the full history is reconstructible.';

ALTER TABLE public.report_emission_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "emission_events_read" ON public.report_emission_events;
CREATE POLICY "emission_events_read"
  ON public.report_emission_events FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.studies s
    WHERE s.id = report_emission_events.study_id
  ));

DROP POLICY IF EXISTS "emission_events_admin_write" ON public.report_emission_events;
CREATE POLICY "emission_events_admin_write"
  ON public.report_emission_events FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role));

-- ───────────────────────────────────────────────────────────────────────
-- 6. clinician_edit_deltas — append-only field-level edit/accept/reject
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.clinician_edit_deltas (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id                uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  clinician_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  field_id                text NOT NULL,                  -- stable v2 dot-path id
  edit_type               text NOT NULL CHECK (edit_type IN ('accept', 'edit', 'clear', 'reject')),
  original_value          jsonb,
  new_value               jsonb,
  original_derived_from   text,                            -- model/rule/biomarker/pending
  source_emission_id      uuid REFERENCES public.report_emission_events(id) ON DELETE SET NULL,
  reason_code             text,                            -- 'artifact', 'wrong_lateralization', etc.
  reason_text             text,
  information_value       numeric,                         -- computed later by training pipeline
  client_request_id       text,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS edit_deltas_study_idx
  ON public.clinician_edit_deltas (study_id, created_at DESC);

CREATE INDEX IF NOT EXISTS edit_deltas_field_idx
  ON public.clinician_edit_deltas (field_id);

CREATE INDEX IF NOT EXISTS edit_deltas_clinician_idx
  ON public.clinician_edit_deltas (clinician_id, created_at DESC);

CREATE INDEX IF NOT EXISTS edit_deltas_reject_idx
  ON public.clinician_edit_deltas (study_id, field_id)
  WHERE edit_type = 'reject';

COMMENT ON TABLE public.clinician_edit_deltas IS
  'Every accept/edit/clear/reject a clinician performs on a draft field. source_emission_id chains the edit to the exact emission it disputed, so per-emission override rate is computable. information_value is filled by an offline training pipeline (§12.3).';

ALTER TABLE public.clinician_edit_deltas ENABLE ROW LEVEL SECURITY;

-- Clinicians can read their own + same-clinic; admins see all.
DROP POLICY IF EXISTS "edit_deltas_read_self" ON public.clinician_edit_deltas;
CREATE POLICY "edit_deltas_read_self"
  ON public.clinician_edit_deltas FOR SELECT
  TO authenticated
  USING (
    clinician_id = auth.uid()
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'ops'::app_role)
    OR EXISTS (
      SELECT 1
        FROM public.studies s
        JOIN public.clinic_memberships cm ON cm.clinic_id = s.clinic_id
       WHERE s.id = clinician_edit_deltas.study_id
         AND cm.user_id = auth.uid()
    )
  );

-- Inserts: must be the authenticated user inserting their own delta.
DROP POLICY IF EXISTS "edit_deltas_insert_self" ON public.clinician_edit_deltas;
CREATE POLICY "edit_deltas_insert_self"
  ON public.clinician_edit_deltas FOR INSERT
  TO authenticated
  WITH CHECK (
    clinician_id = auth.uid()
    AND EXISTS (
      SELECT 1
        FROM public.studies s
        JOIN public.clinic_memberships cm ON cm.clinic_id = s.clinic_id
       WHERE s.id = clinician_edit_deltas.study_id
         AND cm.user_id = auth.uid()
    )
  );

-- No updates / no deletes (append-only).
DROP POLICY IF EXISTS "edit_deltas_no_update" ON public.clinician_edit_deltas;
CREATE POLICY "edit_deltas_no_update"
  ON public.clinician_edit_deltas FOR UPDATE
  TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "edit_deltas_no_delete" ON public.clinician_edit_deltas;
CREATE POLICY "edit_deltas_no_delete"
  ON public.clinician_edit_deltas FOR DELETE
  TO authenticated USING (false);

-- ───────────────────────────────────────────────────────────────────────
-- 7. reprocess_jobs — bulk reprocess tracking
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.reprocess_jobs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiated_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  description              text,
  target_filter            jsonb NOT NULL,           -- {sla:'STAT', created_after:'…', schema_version:'…'}
  target_model_version_id  uuid REFERENCES public.model_versions(id) ON DELETE SET NULL,
  status                   text NOT NULL CHECK (status IN (
                             'queued', 'running', 'partial', 'completed', 'failed', 'cancelled'
                           )),
  studies_total            integer,
  studies_processed        integer NOT NULL DEFAULT 0,
  studies_failed           integer NOT NULL DEFAULT 0,
  request_id               text,
  started_at               timestamptz,
  finished_at              timestamptz,
  error_summary            text,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reprocess_jobs_status_idx
  ON public.reprocess_jobs (status, created_at DESC);

COMMENT ON TABLE public.reprocess_jobs IS
  'Bulk-reprocess jobs. target_filter is the studies query; target_model_version_id is the model to run. The executor lives outside the DB; this table is the contract + audit + cancel surface.';

ALTER TABLE public.reprocess_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reprocess_jobs_admin_all" ON public.reprocess_jobs;
CREATE POLICY "reprocess_jobs_admin_all"
  ON public.reprocess_jobs FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'ops'::app_role));

-- ───────────────────────────────────────────────────────────────────────
-- 8. studies.triage_draft_json shape validator (BEFORE INSERT/UPDATE)
-- ───────────────────────────────────────────────────────────────────────
--
-- Defense in depth. PG can't run the Zod validator the frontend uses, but
-- it can guarantee the basic shape so malformed payloads never land.
-- Full schema validation runs at the frontend boundary on read.

CREATE OR REPLACE FUNCTION public.validate_triage_draft_json()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v jsonb := NEW.triage_draft_json;
  schema_ver text;
BEGIN
  IF v IS NULL THEN
    RETURN NEW;
  END IF;
  IF jsonb_typeof(v) <> 'object' THEN
    RAISE EXCEPTION 'triage_draft_json must be a JSON object (got %)', jsonb_typeof(v);
  END IF;

  schema_ver := v->>'schema_version';
  IF schema_ver IS NULL THEN
    RAISE EXCEPTION 'triage_draft_json.schema_version is required';
  END IF;
  IF schema_ver NOT IN ('mind.report.v1', 'mind.report.v2') THEN
    RAISE EXCEPTION 'triage_draft_json.schema_version must be one of mind.report.v1 or mind.report.v2 (got %)', schema_ver;
  END IF;

  IF schema_ver = 'mind.report.v2' THEN
    -- Required top-level keys for v2
    IF NOT (v ? 'study_id' AND v ? 'generated_at' AND v ? 'summary'
            AND v ? 'limitations' AND v ? 'signature'
            AND v ? 'background_activity' AND v ? 'interictal'
            AND v ? 'ictal' AND v ? 'photo_modulators') THEN
      RAISE EXCEPTION 'mind.report.v2 missing required top-level keys (have: %)', jsonb_object_keys(v);
    END IF;
    -- study_id must match the row
    IF (v->>'study_id') <> NEW.id::text THEN
      RAISE EXCEPTION 'mind.report.v2.study_id (%) must equal studies.id (%)', v->>'study_id', NEW.id;
    END IF;
    -- summary shape
    IF NOT (v->'summary' ? 'asserted_count' AND v->'summary' ? 'pending_count' AND v->'summary' ? 'limitations_count') THEN
      RAISE EXCEPTION 'mind.report.v2.summary missing asserted_count, pending_count, or limitations_count';
    END IF;
    -- limitations is an array
    IF jsonb_typeof(v->'limitations') <> 'array' THEN
      RAISE EXCEPTION 'mind.report.v2.limitations must be an array';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_triage_draft_json ON public.studies;
CREATE TRIGGER trg_validate_triage_draft_json
  BEFORE INSERT OR UPDATE OF triage_draft_json ON public.studies
  FOR EACH ROW EXECUTE FUNCTION public.validate_triage_draft_json();

COMMENT ON FUNCTION public.validate_triage_draft_json IS
  'Shape-validates studies.triage_draft_json BEFORE write. Catches schema drift before bad payloads corrupt downstream consumers. Full JSON Schema validation runs at the frontend Zod boundary on read.';

-- ───────────────────────────────────────────────────────────────────────
-- 9. updated_at trigger pattern for model_versions
-- ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.model_versions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_model_versions_updated_at ON public.model_versions;
CREATE TRIGGER trg_model_versions_updated_at
  BEFORE UPDATE ON public.model_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────
-- 10. Seed: register the v2 schema definition + known model versions
-- ───────────────────────────────────────────────────────────────────────

INSERT INTO public.schema_definitions (name, version, schema, description, schema_sha256)
SELECT
  'mind.report.v2',
  '2.0.0',
  s.schema,
  'Honest-output clinical report contract (paper §9). Every clinical claim carries provenance + required_channels + (optional) calibrated confidence. Pending is first-class. limitations[] enumerates everything the system refused to assert.',
  encode(digest(s.schema::text, 'sha256'), 'hex')
FROM (
  SELECT $${
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://encephlian.cloud/schemas/mind.report.v2.json",
    "title": "MindReportV2",
    "type": "object",
    "required": ["schema_version", "study_id", "generated_at", "generated_by",
                 "summary", "limitations", "signature", "background_activity",
                 "interictal", "ictal", "photo_modulators"],
    "properties": {
      "schema_version": {"const": "mind.report.v2"},
      "study_id":       {"type": "string", "format": "uuid"},
      "generated_at":   {"type": "string", "format": "date-time"},
      "generated_by":   {"type": "string"},
      "summary": {
        "type": "object",
        "required": ["asserted_count", "pending_count", "limitations_count"],
        "properties": {
          "asserted_count":    {"type": "integer", "minimum": 0},
          "pending_count":     {"type": "integer", "minimum": 0},
          "limitations_count": {"type": "integer", "minimum": 0}
        }
      },
      "limitations": {"type": "array", "items": {"type": "object"}},
      "signature":             {"type": "object"},
      "background_activity":   {"type": "object"},
      "interictal":            {"type": "object"},
      "ictal":                 {"type": "object"},
      "photo_modulators":      {"type": "object"},
      "prose":                 {"type": ["object", "null"]}
    }
  }$$::jsonb AS schema
) s
ON CONFLICT (name, version) DO NOTHING;

-- Known model versions as of 2026-05-28. Status reflects the truth-audit:
-- MIND triage v3 is serving; clean v2 serving; VIGIL+FORGE trained but not
-- deployed; VERTEX heads planned; AUGUR planned. Add new rows as models
-- evolve; never UPDATE these (model identity is immutable per version).
INSERT INTO public.model_versions
  (name, version, family, status, training_corpus, validation_metrics, notes)
VALUES
  ('mind_triage', '3.0.1', 'triage', 'serving',
   'TUH EEG Abnormal v3.0.1',
   '{"auc": 0.857, "f1": 0.78}'::jsonb,
   'Production triage classifier'),
  ('mind_clean',  '2.0.0', 'cleaning', 'serving',
   'TUH EEG Artifact v3.0.0',
   NULL,
   'ICA-based artifact rejector'),
  ('vigil',       '1.0.0', 'quality',  'trained_not_deployed',
   'TUH EEG Abnormal v3.0.1 (1521 EDFs, self-supervised)',
   NULL,
   'Per-channel quality + degradation classifier. On VM; not yet in blob/iplane.'),
  ('forge',       '2.0.0', 'normalization', 'trained_not_deployed',
   'TUH EEG v3.0.1 (69,672 EDFs, multi-clinic)',
   NULL,
   'NT-Xent contrastive clinic-invariant normalization. On VM; not yet in blob/iplane.'),
  ('vertex_head_a', '0.1.0', 'foundation', 'planned',
   'TUAB',
   NULL,
   'Background activity head over frozen EEGPT backbone (paper §7).'),
  ('vertex_head_b', '0.1.0', 'foundation', 'planned',
   'TUAB + TUEV',
   NULL,
   'Asymmetry head.'),
  ('vertex_head_c', '0.1.0', 'foundation', 'planned',
   'TUSZ',
   NULL,
   'IED / seizure head.'),
  ('vertex_head_d', '0.1.0', 'foundation', 'planned',
   'TUSL',
   NULL,
   'Focal slowing head.'),
  ('augur',         '0.0.0', 'language', 'planned',
   NULL,
   NULL,
   'Grammar-constrained CFG decode over SCORE ontology + small LM. Not yet built.'),
  ('heuristic_seizure', '0.1.0', 'heuristic', 'serving',
   NULL,
   NULL,
   'Z-score spike-rule seizure detection. Placeholder until vertex_head_c.')
ON CONFLICT (name, version) DO NOTHING;

-- Link the production triage model to the v1 schema it emits today.
-- (Once it emits v2, register a new model_version row with v2 schema link.)
INSERT INTO public.schema_definitions (name, version, schema, description, schema_sha256)
SELECT 'mind.report.v1', '1.0.0',
  '{"deprecated": true, "succeeded_by": ["mind.report.v2", "2.0.0"]}'::jsonb,
  'Legacy v1 schema. Promoted to v2 by the frontend adapter. Backend emits this; new code should consume v2 only.',
  encode(digest('{"deprecated": true, "succeeded_by": ["mind.report.v2", "2.0.0"]}', 'sha256'), 'hex')
ON CONFLICT (name, version) DO NOTHING;

UPDATE public.model_versions
   SET emits_schema_name    = 'mind.report.v1',
       emits_schema_version = '1.0.0'
 WHERE name IN ('mind_triage', 'mind_clean', 'heuristic_seizure')
   AND emits_schema_name IS NULL;
