# I-Plane ONNX Integration Workflow

This document explains how to train ML models and integrate them into I-Plane for production inference.

## Overview

```
Step 1: Train Models on TUH Corpus
   ↓
Step 2: Validate ONNX Export
   ↓
Step 3: Copy Models to I-Plane
   ↓
Step 4: Deploy I-Plane with Real Inference
   ↓
Step 5: Test End-to-End Pipeline
```

## Step 1: Train MIND Models Locally

### Prerequisites

- Python 3.10+
- TUH corpus downloaded and organized
- ~1 hour of compute time (CPU), ~15 minutes (GPU)

### Training Commands

```bash
cd apps/training

# Check TUH corpus structure
python validate_tuh.py

# Train MIND®Triage
export TUH_ROOT=/path/to/tuh_eeg
python train_triage.py

# Expected output:
# ✅ ONNX model saved: models/mind_triage_v1.onnx

# Train MIND®Clean
python train_clean.py

# Expected output:
# ✅ ONNX model saved: models/mind_clean_v1.onnx
```

### Verify Training Results

```bash
ls -lh models/mind_*.onnx

# Should show:
# -rw-r--r-- mind_triage_v1.onnx (2-5 MB)
# -rw-r--r-- mind_clean_v1.onnx (2-5 MB)
```

## Step 2: Validate ONNX Models

Test that the exported models can be loaded and run inference:

```bash
python -c "
import onnxruntime as ort
import numpy as np

# Load and test triage model
session = ort.InferenceSession('models/mind_triage_v1.onnx')
input_name = session.get_inputs()[0].name
output_name = session.get_outputs()[0].name

# Dummy input: 217 features
dummy_input = np.random.randn(1, 217).astype(np.float32)
output = session.run([output_name], {input_name: dummy_input})

print('✓ Triage model works')

# Load and test clean model
session = ort.InferenceSession('models/mind_clean_v1.onnx')
input_name = session.get_inputs()[0].name

# Dummy input: 231 features
dummy_input = np.random.randn(1, 231).astype(np.float32)
output = session.run([output_name], {input_name: dummy_input})

print('✓ Clean model works')
"
```

## Step 3: Deploy to I-Plane

### Option A: Replace main.py (Recommended for Initial Testing)

```bash
cd apps/iplane

# Backup original
cp main.py main_mock.py

# Use ONNX version
cp main_onnx.py main.py
```

### Option B: Keep Both Versions (Safer)

```bash
cd apps/iplane

# Keep main_onnx.py alongside main.py
# Switch between them in production using environment variable

# In your deployment script:
if [ "$USE_ONNX_MODELS" = "true" ]; then
    cp main_onnx.py main.py
else
    cp main_mock.py main.py
fi
```

## Step 4: Copy Models to I-Plane

```bash
# Copy trained ONNX models
cp apps/training/models/mind_triage_v1.onnx apps/iplane/models/
cp apps/training/models/mind_clean_v1.onnx apps/iplane/models/

# Verify
ls -lh apps/iplane/models/
```

## Step 5: Test I-Plane Locally

### Installation

```bash
cd apps/iplane

# Install dependencies
pip install -r requirements.txt

# Also install ONNX runtime
pip install onnxruntime
```

### Run I-Plane

```bash
python main.py
# Server running on http://localhost:8001
```

### Test Endpoints

#### Health Check (Verify Models Loaded)

```bash
curl http://localhost:8001/health

# Expected response:
{
  "status": "ok",
  "service": "encephlian-iplane",
  "version": "2.0.0",
  "models": {
    "triage": "loaded",
    "clean": "loaded"
  }
}
```

#### Queue Triage Inference

```bash
curl -X POST http://localhost:8001/mind/triage/study-001 \
  -H "Content-Type: application/json" \
  -d '{"study_id": "study-001", "priority": "tat"}'

# Expected response:
{
  "run_id": "abc123def456",
  "status": "queued",
  "tokens_charged": 1
}
```

#### Get Triage Result

```bash
curl http://localhost:8001/mind/triage/study-001/result

# Expected response (ONNX model):
{
  "run_id": "abc123def456",
  "classification": "normal",
  "abnormality_subtypes": null,
  "confidence": 0.92,
  "processing_time_ms": 145
}
```

#### Test Clean Artifact Detection

```bash
curl -X POST http://localhost:8001/mind/clean/study-001

curl http://localhost:8001/mind/clean/study-001/result

# Expected response:
{
  "run_id": "xyz789uvw012",
  "artifacts": [
    {
      "id": "art-0",
      "type": "artifact",
      "severity": "minimal",
      "start_time": 45.5,
      "end_time": 47.5,
      "channels": ["multi"],
      "confidence": 0.68
    }
  ],
  "clean_percentage": 92.5
}
```

### Test with Lovable Frontend

Once I-Plane is running locally:

1. Update E-Plane `.env`:
   ```
   VITE_BACKEND_API_BASE=http://localhost:8001
   ```

2. Start frontend:
   ```bash
   cd eplane
   npm run dev
   # http://localhost:3000
   ```

3. Upload EEG and trigger triage:
   - Go to "Upload EEG"
   - Upload a test file
   - Click "Trigger Triage"
   - See real inference results from ONNX models

## Step 6: Deploy to Azure

### Build Docker Image

```bash
cd apps/iplane

# Create Dockerfile if not present
cat > Dockerfile << 'EOF'
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir onnxruntime

COPY models/ models/
COPY main.py .
COPY onnx_inference.py .

EXPOSE 8001

CMD ["python", "main.py"]
EOF

# Build
docker build -t encephlian-iplane:latest .
```

### Push to Azure Container Registry

```bash
# Login to ACR
az acr login --name your-registry

# Tag image
docker tag encephlian-iplane:latest your-registry.azurecr.io/encephlian-iplane:latest

# Push
docker push your-registry.azurecr.io/encephlian-iplane:latest
```

### Deploy to Container Apps

```bash
az containerapp create \
  --name encephlian-iplane \
  --resource-group your-rg \
  --image your-registry.azurecr.io/encephlian-iplane:latest \
  --target-port 8001 \
  --ingress external \
  --registry-server your-registry.azurecr.io \
  --registry-username "00000000-0000-0000-0000-000000000000" \
  --registry-password "your-password"
```

### Get Public URL

```bash
az containerapp show \
  --name encephlian-iplane \
  --resource-group your-rg \
  --query properties.configuration.ingress.fqdn
```

### Update Frontend to Use Azure Backend

In E-Plane `.env`:
```
VITE_BACKEND_API_BASE=https://encephlian-iplane.YOUR_REGION.azurecontainerapps.io
```

## Troubleshooting

### Models Not Loaded

**Symptom:**
```json
{
  "models": {
    "triage": "not_loaded",
    "clean": "not_loaded"
  }
}
```

**Check:**
```bash
# Verify model files exist
ls -la models/mind_*.onnx

# Verify onnxruntime is installed
pip show onnxruntime

# Check logs for errors
# In main_onnx.py: logger.error() messages
```

### "Failed to load ONNX model" Error

**Solutions:**
1. Verify ONNX runtime is installed: `pip install onnxruntime`
2. Check model file integrity: `file models/mind_triage_v1.onnx`
3. Try on different Python version (3.10-3.11 recommended)

### Inference Timeouts

**Symptoms:**
- Taking >1 second per inference
- Memory usage increases over time

**Solutions:**
1. Use GPU backend: Install `onnxruntime-gpu`
2. Cache results: Results already cached in `RESULTS_CACHE`
3. Reduce batch size (if testing multiple samples)

### Memory Leaks

**Monitor:**
```bash
# During testing
python -c "
import psutil
import os

process = psutil.Process(os.getpid())

for i in range(100):
    # Simulate 100 inferences
    # Memory should stabilize after a few iterations
    print(f'Iteration {i}: {process.memory_info().rss / 1024 / 1024:.1f} MB')
"
```

## Performance Expectations

### MIND®Triage
- **Model size:** ~3-5 MB (ONNX)
- **Inference time:** 10-50ms per study
- **Memory per inference:** ~50 MB
- **Accuracy:** 78-85% on test set

### MIND®Clean
- **Model size:** ~3-5 MB (ONNX)
- **Inference time:** 20-100ms per study
- **Memory per inference:** ~80 MB
- **Detection rate:** >90% artifacts detected

## Next Steps

1. **Retrain Models (if needed)**
   - Increase TUH_ROOT max_files to use full corpus
   - Add data augmentation
   - Hyperparameter tuning

2. **Implement MIND®Seizure**
   - Use temporal sequence model (LSTM/GRU)
   - Train on seizure-annotated TUH subset

3. **Implement MIND®SCORE**
   - Use results from Triage + Clean + Seizure
   - Generate structured IFCN SCORE report
   - Map findings to SNOMED CT codes

4. **A-Plane Integration**
   - Build vendor adapters (EDF, Nihon Kohden, etc.)
   - Parse raw EEG → canonical zarr format
   - Store in Azure Blob Storage

5. **End-to-End Testing**
   - Upload real EEG files
   - Verify A-Plane → C-Plane → I-Plane → E-Plane flow
   - Performance metrics & latency

## Files Summary

| File | Purpose |
|------|---------|
| `apps/training/train_triage.py` | Train triage model |
| `apps/training/train_clean.py` | Train clean model |
| `apps/training/validate_tuh.py` | Validate TUH corpus |
| `apps/iplane/main_onnx.py` | I-Plane with ONNX inference |
| `apps/iplane/onnx_inference.py` | ONNX model wrappers |
| `TRAINING_SETUP.md` | Detailed training instructions |
| `IPLANE_ONNX_WORKFLOW.md` | This file |

## Questions?

- Check logs: `python main.py` shows detailed startup messages
- Test ONNX directly: `python onnx_inference.py`
- Validate TUH: `python apps/training/validate_tuh.py`
