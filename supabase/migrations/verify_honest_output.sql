-- Re-runnable verification suite for the honest-output foundation.
-- Run after applying the foundation + seed migrations to confirm every
-- contract surface fires as designed. RAISEs on any failure so you see
-- which invariant broke.
--
-- Usage:
--   psql <connection> -f supabase/migrations/verify_honest_output.sql
--   -- or paste in the Supabase Studio SQL Editor
--
-- This is NOT a migration. Don't put it in the migrations directory
-- naming convention; it shouldn't be auto-applied.

-- ───────────────────────────────────────────────────────────────────────
-- 1. All seven tables exist with RLS enabled
-- ───────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  required_tables text[] := ARRAY[
    'schema_definitions', 'model_versions', 'model_calibration_runs',
    'channel_quality_assessments', 'report_emission_events',
    'clinician_edit_deltas', 'reprocess_jobs'
  ];
  t text;
  rls_enabled boolean;
BEGIN
  FOREACH t IN ARRAY required_tables LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = t) THEN
      RAISE EXCEPTION 'VERIFY FAIL: table public.% missing — apply 20260528010000_honest_output_foundation.sql', t;
    END IF;
    SELECT relrowsecurity INTO rls_enabled
      FROM pg_class WHERE oid = ('public.' || t)::regclass;
    IF NOT rls_enabled THEN
      RAISE EXCEPTION 'VERIFY FAIL: RLS disabled on public.%', t;
    END IF;
  END LOOP;
  RAISE NOTICE 'VERIFY PASS: all 7 tables exist with RLS enabled';
END $$;

-- ───────────────────────────────────────────────────────────────────────
-- 2. schema_definitions is IMMUTABLE at PG level
-- ───────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  granted_update boolean;
BEGIN
  SELECT bool_or(privilege_type = 'UPDATE') INTO granted_update
    FROM information_schema.table_privileges
   WHERE table_schema = 'public'
     AND table_name = 'schema_definitions'
     AND grantee IN ('anon', 'authenticated', 'PUBLIC');
  IF granted_update THEN
    RAISE EXCEPTION 'VERIFY FAIL: schema_definitions UPDATE not revoked from authenticated/anon';
  END IF;
  RAISE NOTICE 'VERIFY PASS: schema_definitions is INSERT-only at PG level';
END $$;

-- ───────────────────────────────────────────────────────────────────────
-- 3. The v2 schema is registered
-- ───────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  cnt integer;
  schema_sha text;
BEGIN
  SELECT count(*) INTO cnt
    FROM public.schema_definitions
   WHERE name = 'mind.report.v2';
  IF cnt = 0 THEN
    RAISE EXCEPTION 'VERIFY FAIL: no mind.report.v2 row in schema_definitions — apply 20260528010001_seed_mind_report_v2_schema.sql';
  END IF;
  SELECT schema_sha256 INTO schema_sha
    FROM public.schema_definitions
   WHERE name = 'mind.report.v2'
   ORDER BY version DESC LIMIT 1;
  IF schema_sha !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'VERIFY FAIL: schema_sha256 % is not a valid sha256 hex', schema_sha;
  END IF;
  RAISE NOTICE 'VERIFY PASS: mind.report.v2 registered (sha256=%…)', substr(schema_sha, 1, 12);
END $$;

-- ───────────────────────────────────────────────────────────────────────
-- 4. 10 model versions seeded
-- ───────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  cnt integer;
BEGIN
  SELECT count(*) INTO cnt FROM public.model_versions;
  IF cnt < 10 THEN
    RAISE EXCEPTION 'VERIFY FAIL: expected >= 10 model_versions, got %', cnt;
  END IF;
  RAISE NOTICE 'VERIFY PASS: % model_versions registered', cnt;
END $$;

-- ───────────────────────────────────────────────────────────────────────
-- 5. recompute_v2_summary overwrites caller-supplied counts
-- ───────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  out_payload jsonb;
BEGIN
  out_payload := public.recompute_v2_summary(
    '{"summary":{"asserted_count":999,"pending_count":0,"limitations_count":0},
      "limitations":[{"reason":"x"}],
      "signature":{"a":{"provenance":{"derived_from":"model"}},"b":{"provenance":{"derived_from":"pending"}}},
      "background_activity":{},
      "interictal":{},
      "ictal":{},
      "photo_modulators":{}}'::jsonb
  );
  IF (out_payload->'summary'->>'asserted_count')::int <> 1
     OR (out_payload->'summary'->>'pending_count')::int <> 1
     OR (out_payload->'summary'->>'limitations_count')::int <> 1 THEN
    RAISE EXCEPTION 'VERIFY FAIL: recompute_v2_summary did not overwrite caller counts: %', out_payload->'summary';
  END IF;
  RAISE NOTICE 'VERIFY PASS: recompute_v2_summary overrides caller counts';
END $$;

-- ───────────────────────────────────────────────────────────────────────
-- 6. enforce_channel_gate demotes bad-channel fields to pending
-- ───────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  test_study  uuid;
  test_marker text := 'verify_marker_' || encode(gen_random_bytes(4), 'hex');
  payload jsonb;
  out_payload jsonb;
  field_derived text;
  field_reason text;
BEGIN
  SELECT id INTO test_study FROM public.studies LIMIT 1;
  IF test_study IS NULL THEN
    RAISE NOTICE 'VERIFY SKIP: enforce_channel_gate (no studies row to borrow)';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.channel_quality_assessments
      (study_id, channel_label, source, source_version, quality_class, confidence)
    VALUES (test_study, 'O1', test_marker, 'verify', 'bad', 0.95);

    payload := jsonb_build_object(
      'signature', jsonb_build_object(
        'x', jsonb_build_object(
          'field_id', 'signature.x',
          'value', 9.2,
          'provenance', jsonb_build_object(
            'derived_from', 'model',
            'source', 'mind_triage_v3',
            'model_name', 'mind_triage',
            'model_version', '3.0.1'
          ),
          'required_channels', jsonb_build_array('O1', 'O2')
        )
      )
    );
    out_payload := public.enforce_channel_gate(test_study, payload);
    field_derived := out_payload->'signature'->'x'->'provenance'->>'derived_from';
    field_reason  := out_payload->'signature'->'x'->'provenance'->>'pending_reason';

    IF field_derived <> 'pending' THEN
      RAISE EXCEPTION 'VERIFY FAIL: enforce_channel_gate did not demote (got %)', field_derived;
    END IF;
    IF field_reason IS NULL OR field_reason NOT LIKE '%O1%' THEN
      RAISE EXCEPTION 'VERIFY FAIL: pending_reason did not mention O1 (got %)', field_reason;
    END IF;
    RAISE NOTICE 'VERIFY PASS: enforce_channel_gate demotes O1-dependent fields to pending';

    DELETE FROM public.channel_quality_assessments
     WHERE study_id = test_study AND source = test_marker;
  EXCEPTION WHEN OTHERS THEN
    DELETE FROM public.channel_quality_assessments
     WHERE study_id = test_study AND source = test_marker;
    RAISE;
  END;
END $$;

-- ───────────────────────────────────────────────────────────────────────
-- 7. validate_triage_draft_json refuses an obviously bad payload
-- ───────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  test_study uuid;
  threw boolean := false;
BEGIN
  SELECT id INTO test_study FROM public.studies LIMIT 1;
  IF test_study IS NULL THEN
    RAISE NOTICE 'VERIFY SKIP: validate_triage_draft_json (no studies row to test against)';
    RETURN;
  END IF;

  BEGIN
    UPDATE public.studies
       SET triage_draft_json = '{"schema_version":"nope"}'::jsonb
     WHERE id = test_study;
    threw := false;
  EXCEPTION WHEN OTHERS THEN
    threw := true;
  END;

  IF NOT threw THEN
    -- Revert the bad write that snuck through, then complain.
    UPDATE public.studies SET triage_draft_json = NULL WHERE id = test_study;
    RAISE EXCEPTION 'VERIFY FAIL: validate_triage_draft_json accepted an unknown schema_version';
  END IF;
  RAISE NOTICE 'VERIFY PASS: validate_triage_draft_json refuses unknown schema_version';
END $$;

-- ───────────────────────────────────────────────────────────────────────
-- 8. log_triage_emission auto-fires on a real v2 write
-- ───────────────────────────────────────────────────────────────────────
-- We use an existing study and a minimal v2 payload, then verify the
-- emission row appeared with a DB-computed payload_sha256. Cleans up
-- both the study revert and the emission row.
--
-- This test mutates a real studies row. It uses gen_random_bytes for the
-- generated_by field so the inserted emission row is uniquely findable
-- and can be cleaned up. The study's prior triage_draft_json is preserved.

DO $$
DECLARE
  test_study   uuid;
  prior_json   jsonb;
  marker       text := 'verify_emit_' || encode(gen_random_bytes(4), 'hex');
  test_payload jsonb;
  found        integer;
  found_sha    text;
  expected_sha text;
BEGIN
  SELECT id, triage_draft_json INTO test_study, prior_json
    FROM public.studies LIMIT 1;
  IF test_study IS NULL THEN
    RAISE NOTICE 'VERIFY SKIP: log_triage_emission (no studies row)';
    RETURN;
  END IF;

  test_payload := jsonb_build_object(
    'schema_version', 'mind.report.v1',
    'study_id', test_study::text,
    'generated_by', marker,
    'triage', jsonb_build_object('classification', 'normal')
  );

  BEGIN
    UPDATE public.studies SET triage_draft_json = test_payload WHERE id = test_study;

    SELECT count(*) INTO found
      FROM public.report_emission_events
     WHERE study_id = test_study AND emitted_by = marker;

    IF found <> 1 THEN
      RAISE EXCEPTION 'VERIFY FAIL: expected 1 emission row for marker %, got %', marker, found;
    END IF;

    SELECT payload_sha256 INTO found_sha
      FROM public.report_emission_events
     WHERE study_id = test_study AND emitted_by = marker
     ORDER BY emitted_at DESC LIMIT 1;

    expected_sha := encode(digest(
      (SELECT triage_draft_json::text FROM public.studies WHERE id = test_study),
      'sha256'
    ), 'hex');

    IF found_sha <> expected_sha THEN
      RAISE EXCEPTION 'VERIFY FAIL: payload_sha256 mismatch (DB stored %, expected %)', found_sha, expected_sha;
    END IF;

    RAISE NOTICE 'VERIFY PASS: log_triage_emission fires with DB-computed sha256';

    -- Restore prior state and remove our test emission row.
    UPDATE public.studies SET triage_draft_json = prior_json WHERE id = test_study;
    DELETE FROM public.report_emission_events
      WHERE study_id = test_study AND emitted_by = marker;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.studies SET triage_draft_json = prior_json WHERE id = test_study;
    DELETE FROM public.report_emission_events
      WHERE study_id = test_study AND emitted_by = marker;
    RAISE;
  END;
END $$;

-- ───────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  RAISE NOTICE '✓ All honest-output verification checks complete. If you see this without any RAISE EXCEPTION above, the foundation is enforcing the §9 contract.';
END $$;
