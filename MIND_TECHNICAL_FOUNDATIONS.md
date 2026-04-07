# ENCEPHLIAN MIND® — Technical Foundations & Innovation Vectors

**Obsidian Note: Deep dive into mathematical & neuroscientific foundations**

---

## Context: Why This Matters

You have a **Read API serving canonical EEG** (deterministic zarr tensors, vendor-agnostic). The 4 MIND modules sit on top and extract clinical intelligence. This note covers the *why* and *how* behind each module — not the UI or deployment, but the signal processing, ML theory, and clinical reasoning that makes them work.

**Competitor baseline:** Holberg/Natus autoSCORE = black-box binary classifier (Normal/Abnormal + 4 subtypes). Your advantage: **modular, interpretable, vendor-neutral, confidence-aware.**

---

## Module 1: MIND®Triage — Beyond Binary Classification

### The Problem with "Normal vs Abnormal"

Holberg's 5-class system (Normal, focal epileptiform, generalized epileptiform, focal non-epileptiform, diffuse non-epileptiform) solves the **granularity problem** but hides a deeper issue: **what you actually need is risk stratification, not just categorization.**

### Mathematical Framing

Triage is a **confidence-calibrated ordinal regression problem**, not softmax classification:

```
Input: EEG tensor (channels × samples) → 256 Hz, 20 min typical
         ↓
Signal preprocessing:
  - Notch filter (50/60 Hz line noise)
  - Bandpass 0.5-70 Hz (preserve clinically relevant frequencies)
  - Robust z-score normalization per channel (handles amplitude variance)
         ↓
Feature extraction (non-learnable):
  - Spectral: PSD per frequency band (delta, theta, alpha, beta, gamma)
  - Temporal: auto-correlation, entropy, kurtosis per channel
  - Cross-channel: coherence matrix (relationships between regions)
  - Morphological: sharp wave detection (template matching on high-pass filtered 15-70 Hz)
         ↓
Neural backbone: Vision Transformer or TCN on 1-2 min windows
  - Why VT? EEG is spatial (electrode geometry) + temporal (20-30 min recording)
  - Why TCN? Causal convolutions preserve temporal ordering
         ↓
Output layer (ordinal regression, not softmax):
  - P(risk_level_0) P(risk_level_1) P(risk_level_2) ... P(risk_level_N)
  - NOT "normal probability" but "cumulative probability of abnormality"
  - Allows uncertainty: "50% confidence this is abnormal" is meaningful
         ↓
Clinical interpretation:
  - High confidence abnormal → STAT priority
  - Medium confidence → flag for second opinion
  - High confidence normal → TAT priority
```

### Why This Differs from Holberg

| Aspect | Holberg | ENCEPHLIAN MIND®Triage |
|--------|---------|------------------------|
| Output | 5-class softmax | Ordinal risk score + confidence interval |
| Uncertainty | Implicit (argmax only) | Explicit (Bayesian or ensemble) |
| Failure mode | Confident wrong | Admits "don't know" |
| Calibration | Frozen post-training | Can be recalibrated per clinic |
| Speed | ~1-2 sec per study | <100ms (1-2 min window sufficient) |

### Implementation Notes

**What to measure:**
- Per-frequency power ratio (epileptiform: typically 0.5-3 Hz power ↑ or 15-30 Hz ↑)
- Spatial coherence (epileptiform: localized regions hypersynchronized)
- Sharp wave morphology (high-pass filter 15-70 Hz, match to Harboyan-Hirsch template)
- Entropy drop (seizure onset: sudden drop in spectral entropy)

**What NOT to do:**
- Don't use raw amplitude (scales with electrode distance, impedance)
- Don't assume stationarity (EEG is non-stationary by definition)
- Don't train on mixed artifact (separate artifact removal first)

---

## Module 2: MIND®Clean — Artifact Removal via ICA + Learned Spatial Filtering

### The Signal Processing Challenge

Raw EEG = **EEG activity + artifacts**. Artifacts are larger (100-500 μV vs 10-50 μV for background). Holberg ignores this; ENCEPHLIAN quantifies it.

```
Contaminated EEG:
  Primary artifacts:
    - Eye movements (EOG): 50-200 Hz, frontal dominance
    - Muscle (EMG): 20-200 Hz, broadband, high-amplitude
    - Electrode contact loss: DC drift, sudden amplitude loss
    - Sweat/movement: slow baseline wander
    - ECG: 1-2 Hz fundamental + harmonics
    - Line noise: 50/60 Hz + harmonics
```

### Two-Stage Approach: ICA + Learned Masking

**Stage 1: ICA (Independent Component Analysis)**
```
Perform ICA on raw EEG → 21 independent components (one per channel typically)
  ↓
Classify each IC as "brain" or "artifact":
  - Eye: high correlation with EOG channel (if available), frontal dominance
  - Muscle: spectrum > 30 Hz dominant, high kurtosis
  - Cardiac: peak at ~1.2 Hz, characteristic morphology
  - Line noise: spikes at exactly 50/60 Hz + harmonics
  - Drift: very low frequency component (< 0.1 Hz)
  ↓
Reconstruct EEG from "brain" ICs only
  ↓
Problem: ICA is (1) slow, (2) assumes linear mixing, (3) not deterministic
```

**Stage 2: Learned Spatial Filtering (Novel)**
```
Train a neural network to predict artifact masks:
  Input: Raw EEG (channels × time)
  Output: Per-sample, per-channel confidence that sample is artifact

Architecture:
  - Spectrogram (STFT): 200 bins × time
  - Conv1D layers: learn frequency-specific artifact signatures
  - Output: sigmoid per channel per time step

Loss function:
  - Reconstruction loss: ICA gives ground truth (IC backprojection)
  - Sparsity loss: encourage sparse masking (most EEG is clean)

Advantage over ICA:
  - Runs in <100ms (ICA is ~1-2 sec for 20 min)
  - Handles non-stationary artifacts (muscle clench, eye blink)
  - Confidence per sample (ICA is binary per IC)
  - Deterministic (no convergence randomness)
```

### Output: Artifact Map

```json
{
  "run_id": "run-clean-abc123",
  "artifacts": [
    {
      "id": "art-001",
      "type": "muscle",
      "severity": "moderate",
      "start_time": 12.5,
      "end_time": 13.2,
      "channels": ["C3", "C4", "Cz"],
      "confidence": 0.92,
      "frequency_dominant": "50-100 Hz"
    }
  ],
  "clean_percentage": 87.3,
  "clean_segments": [
    {"start": 0, "end": 12.5},
    {"start": 13.2, "end": 1200}
  ]
}
```

### Why This Matters Clinically

- Clinician knows **how much of the study is interpretable** (87% vs 40%)
- Prevents **false negatives** (abnormality hidden under artifact)
- Enables **selective averaging** (only average clean segments for better SNR)
- Foundation for MIND®Seizure (only analyze clean windows)

---

## Module 3: MIND®Seizure — Temporal Event Detection via Sequence Modeling

### Why This Is Hard

**Seizure signatures vary by type:**
- Generalized tonic-clonic: 2-3 Hz high-amplitude rhythmic activity
- Focal dyscognitive: 4-7 Hz focal spike-wave bursts
- Absence: 3 Hz generalized spike-and-wave (very stereotyped)
- Myoclonic: single high-amplitude sharp transients

**Seizure onset is ambiguous:**
- True onset: ictal EEG first appears
- Symptom onset: patient has clinical manifestations (delayed 1-10 sec)
- False positives: benign artifacts (vertex waves, sleep spindles, eye blinks)

### Sequence-to-Sequence Architecture

```
Problem: Given 20 min EEG, locate all seizure events (start time, end time, type)

Approach: Temporal segmentation (like video action detection)

Input: Sliding windows (2 sec non-overlapping)
  └─ 512 samples/window @ 256 Hz
  └─ 21 channels
  └─ 600 windows total for 20 min

Per-window feature extraction:
  - Spectral (fast): PSD via Welch (0-70 Hz, 1 Hz bins)
  - Morphological: peak-frequency, spectral power ratio, entropy
  - Temporal coherence: cross-channel correlation matrix eigenvalues
  - Sharpness: high-pass filtered (15-70 Hz) kurtosis

Neural backbone: LSTM or Transformer with temporal attention
  Input: (batch=1, time=600, features=128)
  Output: (batch=1, time=600, classes=5)
    Classes: [no_seizure, focal_onset, focal_evolution, generalized_onset, generalized_evolution]

Key insight: Model **state transitions**, not static windows
  - "Focal onset" → "focal evolution" → "post-ictal"
  - Prevents flip-flopping (every other window = seizure)
  - Uses HMM-like constraints (valid transitions only)

Loss function (weighted):
  - False negatives (missing seizure): 10x weight
  - False positives (artifact flagged): 2x weight
  - Boundary precision: L1 loss on transition times

Output: Event list
  {
    "id": "ep-001",
    "type": "focal_onset_left_temporal",
    "onset_time": 145.3,
    "offset_time": 187.2,
    "duration_seconds": 41.9,
    "confidence": 0.87,
    "frequency_dominant": "4-7 Hz",
    "morphology": "spike-and-wave",
    "propagation": "focal → bilateral secondary generalization"
  }
```

### Validation Strategy (No Ground Truth)

You won't have annotated seizure ground truth for most patients. Instead:

1. **Clinical validation**: Correlate detected events with symptom report (patient says "had 3 seizures")
2. **Morphology consistency**: Repeat detections have consistent frequency/channels
3. **Post-ictal signature**: Post-ictal EEG has characteristic slowing (model should detect this)
4. **Benchmark on public datasets**: CHB-MIT, TUSZ (Boston Children's hospital, Temple University)

---

## Module 4: MIND®SCORE — Structured Reporting via Knowledge Graph

### Why IFCN SCORE Matters

ILAE (International League Against Epilepsy) standardized EEG reporting → **reproducible, searchable, comparable clinically.**

**Old way:** Free-text reports (difficult to query, machine-unreadable)
```
"Patient shows 1-2 Hz generalized activity with 100 μV amplitude,
worse during drowsiness, consistent with generalized background
abnormality. Interictal focal spikes noted over left temporal region.
One subclinical seizure observed at minute 12."
```

**IFCN SCORE way:** Structured terms → machine-readable → enables meta-analysis
```
background_activity:
  posterior_dominant_rhythm:
    present: true
    frequency: 10 Hz
    amplitude: 50 μV
    reactivity: present
interictal_findings:
  - type: "spike"
    laterality: "left"
    region: "temporal"
    abundance: "occasional"
diagnostic_significance:
  classification: "abnormal_epileptiform"
  icd_code: "G40.109"
```

### Architecture: Semantic Graph + Template Generation

```
Problem: Map raw EEG features → IFCN SCORE terms + reasoning

Approach: Knowledge graph + neural narrative generation

Step 1: Feature → IFCN Term Mapping
  Input: Detected features (spectral, morphological, temporal)
  Rules engine:
    if frequency_dominant in [0.5, 3] Hz AND amplitude > 100 μV:
      → candidate term: "spike" or "sharp_wave"
    if bursts_every_2_sec AND 3 Hz frequency AND generalized:
      → candidate term: "generalized_spike_and_wave"
    if localized AND brief (<200 ms) AND morphology = "sharp":
      → candidate term: "sharp_transient"

  Output: List of (term, confidence, evidence)

Step 2: Clinical Reasoning (Sequence Decision)
  Question: Which features are *pathological*?
  - Not: "slow activity is always bad"
  - But: "excessive theta during awake, eyes-closed → abnormal"
        "theta during drowsy → normal"

  Knowledge: Age-dependent norms
    - Infant (0-3 mo): delta/theta dominant (normal)
    - Toddler (1-3 y): theta burst during sleep (normal)
    - Child (3-12 y): 8-12 Hz alpha (normal)
    - Adult (>13 y): 8-13 Hz alpha, <50 μV (normal)

  Logic: "Found 5 Hz activity in adult → abnormal
           Found 5 Hz activity in 2-year-old → normal"

Step 3: Structured Report Generation
  Input: Processed findings + clinical context
  Template (IFCN SCORE v2):
    1. Recording conditions (consciousness, cooperation, activation procedures)
    2. Background activity (PDR, continuity, voltage)
    3. Interictal findings (spikes, sharp waves, abundance, laterality)
    4. Episodes/seizures (type, onset, evolution, duration)
    5. Artifacts (type, severity, impact on interpretation)
    6. Diagnostic significance (classification, confidence, ICD codes)

  Narrative engine (LLM or template-based):
    Generate human-readable summary from structured data
    "EEG shows well-formed 10 Hz posterior dominant rhythm,
     symmetric, reactive. Interictal left temporal spikes noted
     occasionally. No seizures recorded. Findings consistent with
     partial epilepsy, left temporal focus."

Output: SCOREReport (JSON + PDF)
```

### Why This Beats Free Text

| Aspect | Free Text | IFCN SCORE |
|--------|-----------|-----------|
| Searchability | "Find all temporal spikes" → manual | "interictal_findings[].region = 'temporal'" → instant |
| Consistency | Neurologist A says "rare spikes", B says "occasional" (same thing?) | Defined terms: rare = 1-5/min, occasional = 5-50/min, frequent = >50/min |
| Reproducibility | Same EEG, different clinicians → different reports | Same EEG → deterministic SCORE (given same features detected) |
| Meta-analysis | Can't compare 100 reports (all different phrasing) | Can aggregate "abnormal_epileptiform" across 100 studies |
| ICD coding | Clinician guesses → "I think this is G40.1" | SCORE → deterministic ICD mapping |

---

## Integration: The Full Pipeline

```
Raw EEG (vendor-agnostic EDF/BDF)
    ↓
[A-PLANE] Canonicalization (zarr tensor, metadata)
    ↓
[C-PLANE] Canonical format (deterministic, immutable)
    ↓
[I-PLANE] Inference:
    ├─ MIND®Triage: binary classification + confidence
    ├─ MIND®Clean: artifact localization + severity
    ├─ MIND®Seizure: event detection + classification
    └─ MIND®SCORE: structured report generation
    ↓
[E-PLANE] Experience (frontend):
    ├─ EEG Viewer (canvas, segments/artifacts overlaid)
    ├─ SCORE Report (interactive, clickable findings)
    └─ Bidirectional navigation (report ↔ viewer)
```

**Critical property:** Same run_id (SHA256 of input + model versions) → **identical outputs always**. No randomness, no timestamp variation. Enables:
- Audit trails (prove what result was at timestamp T)
- Deterministic retry (re-process = same output)
- Caching (same input = skip recomputation)

---

## Innovation Vectors (What's NOT Saturated)

### 1. **Confidence Calibration**
Holberg outputs hard classifications. ENCEPHLIAN outputs calibrated confidence intervals. Enables:
- Selective review (only flag high-uncertainty cases)
- Risk-based triage (confidence-aware priority)
- Neurodevelopmental adaptation (confidence thresholds per age group)

### 2. **Artifact-Aware Analysis**
Most systems ignore artifact. ENCEPHLIAN quantifies it:
- "87% of study is clean; results are reliable"
- "Severe muscle artifact 12-13 min; seizure might be hidden"
- Prevents false reassurance ("normal EEG" when 40% is artifact)

### 3. **Deterministic Inference**
ML is stochastic. ENCEPHLIAN enforces determinism:
- Same input + model → exact same output always
- Enables legal admissibility (reproducible, auditable)
- Enables caching (computational efficiency)

### 4. **Age/Context-Aware Norms**
Seizure detection needs pediatric-specific models, not adult-only. ENCEPHLIAN will have:
- Infant model (0-3 mo): delta/theta norms
- Toddler model (1-3 y): sleep spindle vs seizure
- Child model (3-12 y): developmental norms
- Adult model (>13 y): standard)

### 5. **Vendor-Agnostic Architecture**
Holberg is locked to Natus hardware. ENCEPHLIAN works on:
- Any EDF/BDF file
- Any electrode montage
- Any sample rate (resampled to canonical)
- Any duration (1 min to 24 hr)

---

## Data & Training Strategy

### What You Need

**For MIND®Triage:**
- 500-1000 labeled EEGs (normal/abnormal, ideally with confidence scores from multiple raters)
- Public: CHB-MIT (Boston Children's) — 664 EEGs
- Public: TUSZ (Temple University) — 3000+ EEGs
- Internal: Clinic data (start small, iterate)

**For MIND®Clean:**
- 100-200 EEGs with manual artifact annotation
- Or: Use ICA as weak supervision (ICA → IC classification)

**For MIND®Seizure:**
- 50-100 EEGs with annotated seizure events
- Public: CHB-MIT, TUSZ (seizure-rich subsets)
- Challenge: Seizures are rare (1-2% of raw EEG time)

**For MIND®SCORE:**
- 200+ EEGs with expert SCORE annotations
- Or: Rule-based initially, then refine with expert feedback

### Training Pipeline

```
Phase 1 (Month 1): Baselines on public datasets
  ├─ MIND®Triage on TUSZ (target: 85% accuracy)
  ├─ MIND®Clean on manually annotated subset (target: 90% recall)
  └─ MIND®Seizure on CHB-MIT (target: 80% recall at <5% false positive rate)

Phase 2 (Month 2-3): Fine-tune on clinic data
  ├─ Gather 100 studies from pilot clinic
  ├─ Clinician reviews and labels (triage: normal/abnormal + confidence)
  ├─ Update models with domain adaptation
  └─ Iterate until clinician agrees with 90%+ of calls

Phase 3 (Month 4+): Deployment & monitoring
  ├─ Deploy to Azure Container Apps
  ├─ Log all predictions + clinician feedback
  ├─ Monthly retraining on accumulated clinic data
  └─ A/B test: automated triage vs. manual (measure time saved, error rate)
```

---

## Success Metrics (Not Revenue)

- **MIND®Triage:** Time-to-diagnosis ↓ 50%, clinician agreement >90%
- **MIND®Clean:** False negatives due to artifact <5%, interpretability score >8/10
- **MIND®Seizure:** Seizure recall >85%, false positive rate <10%
- **MIND®SCORE:** Report consistency >95% (same finding coded identically)

---

## Next Build Phase

With Supabase auth + E-Plane frontend, the path forward:

1. **Backend API (Azure Functions or FastAPI):**
   - `/mind/triage/{study_id}` → trigger model inference
   - `/mind/clean/{study_id}` → return artifact map
   - `/mind/seizure/{study_id}` → return events
   - `/mind/score/{study_id}` → return structured report

2. **Model Serving:**
   - Load models on startup (ONNX format for speed)
   - Queue system for long-running jobs (celery/RabbitMQ)
   - Caching (deterministic SHA256 keys)

3. **Data Pipeline:**
   - Validate EEG (correct format, not corrupted)
   - Canonicalize via C-Plane
   - Run all 4 MIND modules in parallel
   - Return results to E-Plane viewer

4. **Clinician Feedback Loop:**
   - Log predictions + clinician corrections
   - Monthly retraining on accumulated data
   - Version control for models (model A vs B performance)

---

**This is the real work. The UI is done.**
