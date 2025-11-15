-- Add sample column to studies table
ALTER TABLE studies ADD COLUMN IF NOT EXISTS sample BOOLEAN DEFAULT false;

-- Create 5 global sample studies with predictable IDs
INSERT INTO studies (id, clinic_id, owner, state, sla, created_at, meta, sample, duration_min, srate_hz) VALUES
  ('00000000-0000-0000-0000-000000000001', (SELECT id FROM clinics LIMIT 1), 'f1b8a438-7229-4873-b1dc-d1803be5db62', 'signed', 'TAT', NOW() - INTERVAL '30 days',
   '{"patient_name": "Sample Patient A", "patient_id": "SAMPLE-001", "age": 35, "gender": "M", "indication": "Routine EEG - Normal baseline"}'::jsonb, 
   true, 60, 256),
   
  ('00000000-0000-0000-0000-000000000002', (SELECT id FROM clinics LIMIT 1), 'f1b8a438-7229-4873-b1dc-d1803be5db62', 'signed', 'TAT', NOW() - INTERVAL '25 days',
   '{"patient_name": "Sample Patient B", "patient_id": "SAMPLE-002", "age": 28, "gender": "F", "indication": "Epilepsy - Sharp wave activity"}'::jsonb,
   true, 60, 256),
   
  ('00000000-0000-0000-0000-000000000003', (SELECT id FROM clinics LIMIT 1), 'f1b8a438-7229-4873-b1dc-d1803be5db62', 'signed', 'TAT', NOW() - INTERVAL '20 days',
   '{"patient_name": "Sample Patient C", "patient_id": "SAMPLE-003", "age": 42, "gender": "M", "indication": "Sleep study - Alpha rhythms"}'::jsonb,
   true, 60, 256),
   
  ('00000000-0000-0000-0000-000000000004', (SELECT id FROM clinics LIMIT 1), 'f1b8a438-7229-4873-b1dc-d1803be5db62', 'uploaded', 'TAT', NOW() - INTERVAL '15 days',
   '{"patient_name": "Sample Patient D", "patient_id": "SAMPLE-004", "age": 55, "gender": "F", "indication": "Artifact demo - Eye/muscle"}'::jsonb,
   true, 60, 256),
   
  ('00000000-0000-0000-0000-000000000005', (SELECT id FROM clinics LIMIT 1), 'f1b8a438-7229-4873-b1dc-d1803be5db62', 'in_review', 'STAT', NOW() - INTERVAL '10 days',
   '{"patient_name": "Sample Patient E", "patient_id": "SAMPLE-005", "age": 19, "gender": "M", "indication": "Post-trauma - STAT priority"}'::jsonb,
   true, 60, 256)
ON CONFLICT (id) DO NOTHING;

-- Link all samples to the existing EDF file in the study_files table (use 'edf' not 'eeg')
INSERT INTO study_files (study_id, kind, path, size_bytes) VALUES
  ('00000000-0000-0000-0000-000000000001', 'edf', 'sample-eeg/S094R10.edf', 1024000),
  ('00000000-0000-0000-0000-000000000002', 'edf', 'sample-eeg/S094R10.edf', 1024000),
  ('00000000-0000-0000-0000-000000000003', 'edf', 'sample-eeg/S094R10.edf', 1024000),
  ('00000000-0000-0000-0000-000000000004', 'edf', 'sample-eeg/S094R10.edf', 1024000),
  ('00000000-0000-0000-0000-000000000005', 'edf', 'sample-eeg/S094R10.edf', 1024000)
ON CONFLICT DO NOTHING;

-- Update RLS policies to allow ALL authenticated users to see sample studies
DROP POLICY IF EXISTS "studies_scope" ON studies;
CREATE POLICY "studies_scope" ON studies FOR SELECT TO authenticated
USING (
  sample = true 
  OR owner = auth.uid() 
  OR EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = studies.clinic_id)
  OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'ops'))
);

-- Update study_files policy
DROP POLICY IF EXISTS "files_scope" ON study_files;
CREATE POLICY "files_scope" ON study_files FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM studies s 
    WHERE s.id = study_files.study_id 
    AND (
      s.sample = true
      OR s.owner = auth.uid()
      OR EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = s.clinic_id)
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'ops'))
    )
  )
);

-- Update eeg_markers policy
DROP POLICY IF EXISTS "markers_scope" ON eeg_markers;
CREATE POLICY "markers_scope" ON eeg_markers FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM studies s 
    WHERE s.id = eeg_markers.study_id 
    AND (
      s.sample = true
      OR s.owner = auth.uid()
      OR EXISTS (SELECT 1 FROM my_memberships m WHERE m.clinic_id = s.clinic_id)
      OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'ops'))
    )
  )
);