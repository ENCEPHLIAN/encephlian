-- Phase 2: Professional Report Templates
-- Insert Normal EEG Template
INSERT INTO report_templates (name, type, template_content, style_config) VALUES (
  'Normal Adult EEG - Routine',
  'normal',
  jsonb_build_object(
    'clinical_indication', '{{indication}}',
    'technical_details', jsonb_build_object(
      'montage', 'Longitudinal bipolar (double banana) and referential',
      'filters', 'Low frequency: 1 Hz, High frequency: 70 Hz, Notch: 60 Hz',
      'duration', '{{duration_min}} minutes',
      'channels', '21-channel 10-20 system'
    ),
    'background_activity', 'The posterior dominant rhythm is well-organized and symmetric, measuring 9-10 Hz with amplitudes ranging from 30-50 μV. It attenuates appropriately with eye opening. The anterior-posterior gradient is preserved with lower amplitude faster frequencies anteriorly. Background activity is continuous and appropriate for age.',
    'sleep_architecture', 'Drowsiness is characterized by slowing of the posterior dominant rhythm and appearance of theta activity. Vertex waves and sleep spindles are symmetric and well-formed during stage N2 sleep.',
    'activation_procedures', jsonb_build_object(
      'hyperventilation', 'Produced appropriate slowing without epileptiform activity',
      'photic_stimulation', 'Photic driving responses present bilaterally without photoparoxysmal response'
    ),
    'abnormalities', 'None observed. No epileptiform discharges, focal slowing, or other abnormalities detected.',
    'artifacts', 'Minimal muscle and movement artifacts noted. EKG artifact present but did not interfere with interpretation.',
    'impression', 'NORMAL AWAKE AND ASLEEP EEG',
    'correlation', 'These findings are within normal limits for age. There is no epileptiform activity or focal abnormality.',
    'recommendations', 'Clinical correlation advised. No additional EEG monitoring indicated based on these findings.',
    'montages_used', jsonb_build_array(
      'Longitudinal bipolar (double banana)',
      'Referential (average reference)',
      'Transverse bipolar'
    )
  ),
  jsonb_build_object(
    'font_family', 'Arial, sans-serif',
    'header_style', 'Natus NeuroWorks',
    'page_margins', '1in',
    'sections_bold', true
  )
) ON CONFLICT DO NOTHING;

-- Insert Abnormal EEG Template
INSERT INTO report_templates (name, type, template_content, style_config) VALUES (
  'Abnormal EEG - Epileptiform Activity',
  'abnormal',
  jsonb_build_object(
    'clinical_indication', '{{indication}}',
    'technical_details', jsonb_build_object(
      'montage', 'Longitudinal bipolar (double banana) and referential',
      'filters', 'Low frequency: 1 Hz, High frequency: 70 Hz, Notch: 60 Hz',
      'duration', '{{duration_min}} minutes',
      'channels', '21-channel 10-20 system'
    ),
    'background_activity', 'The posterior dominant rhythm demonstrates irregular organization with frequencies ranging 7-8 Hz. Asymmetry noted with lower amplitude on the left. Background activity shows intermittent theta-delta slowing predominantly in left hemisphere.',
    'sleep_architecture', 'Sleep architecture demonstrates fragmented patterns. Sleep spindles show asymmetry with reduced amplitude on affected side.',
    'activation_procedures', jsonb_build_object(
      'hyperventilation', 'Activated underlying abnormalities in frontal regions with increased sharp wave frequency',
      'photic_stimulation', 'No photoparoxysmal response observed'
    ),
    'abnormalities', 'EPILEPTIFORM ACTIVITY DETECTED: Frequent sharp waves and spike-wave complexes observed. Location: Left temporal-central region (T3-C3, T5-P3). Frequency: Approximately 1-2 discharges per minute during wakefulness, increasing to 3-4 per minute during drowsiness. Morphology: Sharp waves with aftergoing slow component, amplitude 80-120 μV, duration 70-200 ms. Additional findings: Intermittent focal slowing (theta-delta range, 2-5 Hz) in the same region, consistent with underlying structural abnormality.',
    'artifacts', 'Muscle artifact noted in temporal chains, minimal movement artifact during sleep. Technical quality adequate for interpretation.',
    'impression', 'ABNORMAL EEG demonstrating:\n1. Epileptiform discharges in left temporal-central region\n2. Focal slowing suggestive of underlying structural abnormality\n3. Background asymmetry and mild disorganization',
    'correlation', 'The presence of epileptiform discharges supports an increased risk for seizures. The focal slowing may indicate underlying structural lesion. Clinical correlation with seizure semiology and neuroimaging is strongly recommended.',
    'recommendations', '1. Clinical correlation with patient seizure history and physical examination\n2. Consider initiation or adjustment of antiepileptic medication if clinically indicated\n3. Repeat EEG or prolonged video-EEG monitoring may be beneficial for seizure characterization\n4. Neuroimaging correlation (MRI brain with epilepsy protocol) strongly recommended\n5. Consider consultation with epileptologist if seizures persist',
    'montages_used', jsonb_build_array(
      'Longitudinal bipolar (double banana)',
      'Referential (average reference)',
      'Transverse bipolar',
      'Laplacian montage for localization'
    )
  ),
  jsonb_build_object(
    'font_family', 'Arial, sans-serif',
    'header_style', 'Natus NeuroWorks',
    'page_margins', '1in',
    'sections_bold', true,
    'highlight_abnormalities', true
  )
) ON CONFLICT DO NOTHING;