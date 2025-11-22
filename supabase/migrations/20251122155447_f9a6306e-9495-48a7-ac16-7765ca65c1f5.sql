-- Create report_templates table
CREATE TABLE IF NOT EXISTS public.report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('normal', 'abnormal')),
  template_content JSONB NOT NULL,
  style_config JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add columns to studies table for file tracking
ALTER TABLE public.studies 
ADD COLUMN IF NOT EXISTS uploaded_file_path TEXT,
ADD COLUMN IF NOT EXISTS original_format TEXT;

-- Insert default normal template
INSERT INTO public.report_templates (name, type, template_content, style_config) VALUES
(
  'Normal EEG Template',
  'normal',
  '{
    "background_activity": "The background activity consists of a well-organized posterior dominant rhythm at 9-10 Hz with good anterior-posterior gradient. Alpha rhythm is reactive to eye opening and closure. Beta activity is present symmetrically over the frontal regions. There is appropriate modulation of the background with drowsiness and sleep.",
    "sleep_stages": "Sleep architecture shows normal transitions through drowsiness and light sleep. Vertex sharp transients and sleep spindles are present and symmetric. No focal or epileptiform abnormalities are observed during sleep.",
    "abnormalities": "No epileptiform discharges, sharp waves, or spike discharges observed. No focal slowing or asymmetries noted. Photic stimulation and hyperventilation did not activate any abnormal features.",
    "artifacts": "Minimal muscle artifact and occasional eye blink artifact noted. No significant technical issues that would limit interpretation of the recording.",
    "impression": "This is a NORMAL awake and asleep EEG recording. No epileptiform abnormalities or focal cerebral dysfunction observed.",
    "recommendations": "No further EEG evaluation indicated at this time based on these findings. Clinical correlation recommended."
  }',
  '{
    "font_family": "Arial",
    "section_spacing": "20px",
    "title_color": "#1e40af"
  }'
)
ON CONFLICT DO NOTHING;

-- Insert default abnormal template
INSERT INTO public.report_templates (name, type, template_content, style_config) VALUES
(
  'Abnormal EEG Template',
  'abnormal',
  '{
    "background_activity": "The background activity shows mild to moderate diffuse slowing with theta range activity at 6-7 Hz replacing the expected posterior dominant rhythm. The anterior-posterior gradient is reduced. Background is poorly modulated with state changes.",
    "sleep_stages": "Sleep architecture shows disrupted patterns with reduced sleep spindle density. Vertex sharp transients are present but asymmetric. Arousal patterns are irregular.",
    "abnormalities": "Intermittent epileptiform discharges are observed in the left temporal region (T3/T5 electrodes) occurring at a frequency of 1-2 per minute. These consist of sharp waves with after-going slow wave complexes. Occasional runs of rhythmic theta activity noted in the same region lasting 2-3 seconds without clear clinical correlate.",
    "artifacts": "Technical artifacts noted intermittently. Electrode impedance was within acceptable limits. No significant motion artifact that would limit interpretation.",
    "impression": "This is an ABNORMAL EEG demonstrating: 1) Mild to moderate diffuse slowing suggesting diffuse cerebral dysfunction, 2) Left temporal epileptiform discharges indicating a potential seizure focus in the left temporal region, 3) Intermittent focal slowing in the left temporal region suggesting underlying structural or functional abnormality.",
    "recommendations": "Clinical correlation is strongly recommended. Consider repeat EEG or video-EEG monitoring if clinically indicated. Neuroimaging correlation (MRI brain) may be helpful to evaluate for structural abnormality. Antiepileptic medication adjustment may be warranted based on clinical presentation."
  }',
  '{
    "font_family": "Arial",
    "section_spacing": "20px",
    "title_color": "#dc2626"
  }'
)
ON CONFLICT DO NOTHING;