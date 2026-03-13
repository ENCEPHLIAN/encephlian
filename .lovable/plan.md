

## Plan: Robust Ingestion Pipeline & Lanes Polish

### Problem Statement
The current upload flow asks clinicians to manually type patient info that already exists inside the EDF/BDF file header. The `parse_eeg_study` edge function exists but is never called automatically. Half-complete uploads create studies with empty metadata. The system should extract everything it can from the file itself and present it plainly — zero manual data entry required.

### Changes

**1. Client-side EDF header auto-extraction on file select (StudyUploadWizard)**
When the user drops/selects a file, read the first 64KB in the browser using the existing `edf-parser.ts`, extract `patientId`, `recordingId`, `startDate`, `startTime`, channel count, duration, and sample rate. Pre-populate the Patient Info step with whatever the file contains. If fields are empty in the header, leave them blank — the clinician can fill them optionally. Show a small "Extracted from file" badge next to auto-filled fields so the clinician knows where the data came from.

**2. Accept broader file extensions with graceful handling**
Expand the accepted file types to include `.e`, `.nk`, `.eeg`, `.21e`, `.cnt` in the upload dialog. For non-EDF/BDF files, skip client-side header extraction but still upload to storage and create the study record with `original_format` set correctly. Show a notice: "This format will be processed server-side." This keeps the vendor-agnostic promise without requiring client parsers for every proprietary format.

**3. Auto-trigger parse_eeg_study after successful upload**
After the study record is created in `handleSubmit`, automatically invoke the `parse_eeg_study` edge function for EDF/BDF files. This eliminates manual intervention — the moment a file lands, metadata JSON is generated, study state advances to `parsed`, and `srate_hz`/`duration_min` are populated.

**4. Store all extracted metadata in study.meta comprehensively**
Merge client-extracted header data (patient ID from EDF header, recording ID, start date/time, channel labels, sample rate, duration, prefiltering info) into `study.meta` on insert. This ensures even if the clinician skips the Patient Info step entirely, the study record has everything the file contained.

**5. Lanes page — add summary stats row**
Add a compact stats bar above the Kanban columns showing: total active studies, overdue percentage, and average time-in-stage for processing column. Three small stat pills, no cards — keeps it tight and clinical.

### Files Modified
- `src/components/upload/StudyUploadWizard.tsx` — changes 1, 2, 3, 4
- `src/pages/app/Lanes.tsx` — change 5

### What Does NOT Change
- Edge functions (`parse_eeg_study`, `create_study_from_upload`) — no modifications
- EDF parser (`edf-parser.ts`) — used as-is for header extraction
- Database schema — no new tables or columns
- Auth flows, RLS policies, routing structure
- EEG Viewer — untouched
- Inference pipeline — deferred per user's explicit constraint

