# Model Training Setup Guide

## Prerequisites

1. **TUH Corpus Access**
   - Download from: https://www.isip.piconepress.com/projects/tuh_eeg/html/download.shtml
   - Required structure:
     ```
     TUH_ROOT/
     ├── train/
     │   ├── normal/
     │   │   ├── 00000/
     │   │   │   ├── s001_*.edf
     │   │   ├── 00001/
     │   │   └── ... (more patients)
     │   └── abnormal/
     │       ├── 00000/
     │       └── ... (more patients)
     └── eval/
         ├── normal/
         └── abnormal/
     ```

2. **Python 3.10+** installed locally

## Step 1: Clone Repository

```bash
cd /path/to/your/workspace
git clone <your-repo-url> encephlian
cd encephlian/apps/training
```

## Step 2: Create Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

## Step 3: Install Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

Expected output: torch, numpy, scipy, scikit-learn, mne all installed

## Step 4: Set TUH Corpus Path

```bash
# Replace with your actual TUH corpus path
export TUH_ROOT=/path/to/tuh_eeg

# Verify
echo $TUH_ROOT
```

## Step 5: Train MIND®Triage Model

```bash
python train_triage.py
```

**Output:**
- `models/mind_triage_v1.pt` (PyTorch model)
- `models/mind_triage_v1.onnx` (ONNX model for inference)

**Expected Training Time:** 5-15 minutes (depends on number of files loaded)

**Expected Metrics:**
- Accuracy: 70-85%
- Precision: 65-80%
- Recall: 75-90%
- ROC-AUC: 0.75-0.90

## Step 6: Train MIND®Clean Model

```bash
python train_clean.py
```

**Output:**
- `models/mind_clean_v1.pt` (PyTorch model)
- `models/mind_clean_v1.onnx` (ONNX model for inference)

**Expected Training Time:** 10-20 minutes

**Expected Metrics:**
- Accuracy: 85-95%
- Precision: 80-90%
- Recall: 85-95%
- ROC-AUC: 0.90-0.98

## Step 7: Verify ONNX Models

```bash
ls -lh models/
# Should see:
# - mind_triage_v1.onnx (~2-5 MB)
# - mind_clean_v1.onnx (~2-5 MB)
```

## Step 8: Deploy to I-Plane

1. Copy ONNX files to I-Plane:
   ```bash
   cp models/mind_triage_v1.onnx ../iplane/models/
   cp models/mind_clean_v1.onnx ../iplane/models/
   ```

2. Update I-Plane `main.py` to load ONNX models (replace mock inference functions)

3. Test endpoints:
   ```bash
   cd ../iplane
   python main.py
   # Visit http://localhost:8001/docs
   ```

## Troubleshooting

### "TUH corpus not found"
- Verify `TUH_ROOT` is set correctly: `echo $TUH_ROOT`
- Verify directory structure has `train/normal`, `train/abnormal`, `eval/normal`, `eval/abnormal`
- Check file permissions: `ls -la $TUH_ROOT/train/normal/ | head`

### "Failed to load EEG files"
- Some EDF files may be corrupted. Scripts skip these automatically
- Minimum 10-20 valid files per category needed for training

### "CUDA out of memory"
- Reduce batch size in train script:
  - `train_triage.py`: Change `BATCH_SIZE = 32` → `16` or `8`
  - `train_clean.py`: Change `BATCH_SIZE = 64` → `32` or `16`

### "Python module not found"
- Ensure virtual environment is activated: `source venv/bin/activate`
- Reinstall dependencies: `pip install -r requirements.txt`

## Next Steps After Training

1. **Integrate ONNX models into I-Plane**
   - Load models using `onnxruntime.InferenceSession()`
   - Replace mock `run_triage_inference()` and `run_clean_inference()`

2. **Test end-to-end**
   - Upload EEG through Lovable frontend
   - Trigger triage inference
   - Verify results display correctly

3. **Deploy I-Plane to Azure**
   - Build Docker image with trained models
   - Push to Azure Container Registry
   - Deploy to Azure Container Apps

4. **Pilot testing**
   - Share with first clinic users
   - Collect feedback and edge cases
   - Iterate on model improvements

## Key Features of Training Scripts

### train_triage.py
- **Task:** Binary classification (Normal vs Abnormal EEG)
- **Features:** 217 dimensional (spectral + temporal across 21 channels)
- **Model:** 3-layer MLP with batch norm and dropout
- **Metrics:** Accuracy, Precision, Recall, ROC-AUC
- **Deterministic:** Same input always produces same output via SHA256 run_id

### train_clean.py
- **Task:** Artifact detection (2-second windows)
- **Features:** 231 dimensional (spectral + temporal + morphological)
- **Model:** Same 3-layer MLP architecture
- **Class Balance:** Handles imbalanced data (most windows are clean)
- **Output:** Per-window artifact probability for visualization

## Performance Expectations

### MIND®Triage
- **Inference Time:** ~10ms per study (full EEG recording)
- **Accuracy:** >80% on held-out test set
- **False Negative Rate:** <5% (critical for safety)

### MIND®Clean
- **Inference Time:** ~20ms per study
- **Artifact Detection:** >90% sensitivity
- **False Positive Rate:** <10% (avoid over-filtering)

## Retraining & Hyperparameter Tuning

If performance is suboptimal:

1. **Increase training data:**
   - Change `max_files` in train scripts (default: 1000 train, 200 eval)

2. **Adjust hyperparameters:**
   ```python
   # In train_*.py:
   EPOCHS = 15  # Increase for better convergence
   LEARNING_RATE = 1e-3  # Decrease for finer tuning
   BATCH_SIZE = 32  # Increase for stability, decrease for better regularization
   ```

3. **Add data augmentation:**
   - Frequency shifting, amplitude scaling, time warping
   - (Future enhancement)

4. **Ensemble methods:**
   - Train multiple models and average predictions
   - (Future enhancement)

## Questions?

Refer to the README files in each directory:
- `apps/training/README.md` — Training details
- `apps/iplane/README.md` — Inference API setup
- `eplane/README.md` — Frontend integration
