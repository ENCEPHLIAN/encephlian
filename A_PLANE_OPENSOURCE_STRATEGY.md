# ENCEPHLIAN A-PLANE: Open-Source Strategy & Go-to-Market

**Level:** Leadership + Community
**Focus:** Open-source positioning, vendor adapters, founder-led sales in India
**Version:** 1.0
**Date:** March 2026

---

## EXECUTIVE SUMMARY

The **A-Plane (Acquisition)** is your **defensible moat** + **community engine**:

- **A-Plane:** Open-source vendor adapter layer (EDF, Natus, Nihon Kohden, Philips, GE, Masimo, etc.)
- **C-Plane:** Proprietary canonical EEG format (deterministic, versioned)
- **I-Plane:** Proprietary inference engine (fine-tuned models on Indian EEG data)

**Why open-source the A-Plane?**
- Vendor adapters = infrastructure utilities (not core IP)
- Community contributions = faster global vendor support
- Network effects = more clinics → more canonical data → better models (C+I)
- Ecosystem play = you become the industry standard

**Revenue flows:**
- B2B SaaS (clinics): Pay for triage tokens (C+I planes)
- B2B2C (OEM distributors): White-label SKUs + revenue share
- Consulting: Vendor integration, model training, hardware integration

---

## PART I: A-PLANE ARCHITECTURE & VENDOR SUPPORT

### Current State

**Supported (Implemented):**
- ✅ **EDF (Nihon Kohden, GE, Philips)** — Standard format, widely used in India
- ✅ **TUH Dataset** — Test data for MVP

**Stubs (Partial Implementation):**
- 🟡 **Natus** — File detection only; loader deferred
- 🟡 **Nihon Kohden** (proprietary) — File detection only

**Not Yet Addressed:**
- ❌ **Philips EEG** (proprietary .eeg format)
- ❌ **GE Carescape** (proprietary .ebml format)
- ❌ **Masimo** (cloud API + proprietary hardware)
- ❌ **Clarity** (by Natus; EMR integration)
- ❌ **Neuro Works** (Natus suite)

### Open-Source Repository Structure

```
encephlian-aplane (GitHub public repo)
│
├── README.md                          # Getting started guide
├── CONTRIBUTING.md                    # Community guidelines
├── LICENSE                            # Apache 2.0 (permissive)
├── pyproject.toml                     # Package metadata
│
├── src/aplane/                        # Main package
│   ├── __init__.py
│   ├── vendor_adapter.py              # Abstract base class
│   ├── canonical/                     # Canonical schema + contract
│   │   ├── schema_v1.json
│   │   ├── channel_map.py
│   │   └── contract.md
│   │
│   ├── vendors/                       # Vendor-specific adapters
│   │   ├── __init__.py
│   │   ├── base.py                    # VendorAdapter ABC
│   │   ├── edf.py                     # EDF format (reference impl)
│   │   ├── natus.py                   # Natus format (stub + implementation)
│   │   ├── nihon_kohden.py            # Nihon Kohden proprietary (stub)
│   │   ├── philips.py                 # Philips (community PR #2)
│   │   ├── ge.py                      # GE Carescape (community PR #5)
│   │   ├── masimo.py                  # Masimo Cloud API (planned)
│   │   └── registry.py                # Plugin registry
│   │
│   └── utils/                         # Shared utilities
│       ├── signal_processing.py
│       ├── validation.py
│       ├── zarr_writer.py
│       └── determinism.py
│
├── tests/                             # Test suite
│   ├── test_edf_loader.py
│   ├── test_vendor_adapters.py
│   ├── test_canonical_contract.py
│   ├── fixtures/                      # Sample EEG files (all formats)
│   │   ├── sample.edf
│   │   ├── sample.natus
│   │   ├── sample_philips.eeg
│   │   └── ...
│   └── conftest.py
│
├── docs/                              # Documentation
│   ├── ARCHITECTURE.md
│   ├── VENDOR_ADAPTER_GUIDE.md        # How to add new vendor
│   ├── CANONICAL_CONTRACT.md
│   ├── TESTING.md
│   ├── RELEASE_PROCESS.md
│   └── examples/
│       ├── load_edf.py
│       ├── load_natus.py
│       └── add_custom_vendor.py
│
├── .github/workflows/
│   ├── ci.yml                         # Lint, test, coverage
│   ├── release.yml                    # Version bump + PyPI publish
│   └── docs.yml                       # Auto-build docs
│
├── ROADMAP.md                         # Public roadmap
└── CHANGELOG.md                       # Release notes
```

### VendorAdapter Abstract Base Class

**src/aplane/vendors/base.py:**
```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
import numpy as np
from typing import Dict, Optional, List

@dataclass
class ChannelInfo:
    """Channel metadata"""
    index: int
    label: str  # Original vendor label
    canonical_id: str  # Mapped to canonical (e.g., "FP1", "C3")
    unit: str  # uV, mV, etc.
    sampling_rate: float  # Hz

@dataclass
class StudyMetadata:
    """Study-level metadata"""
    study_id: str
    vendor: str  # "Natus", "Philips", etc.
    format: str  # File extension or proprietary name
    source_file: str
    n_channels: int
    n_samples: int
    sampling_rate: float  # Hz
    duration_seconds: float
    channels: List[ChannelInfo]
    quality_flags: Optional[Dict] = None
    missingness_flags: Optional[Dict] = None

class VendorAdapter(ABC):
    """Abstract base for EEG vendor adapters"""

    VENDOR_NAME: str = NotImplemented  # e.g., "Natus", "Philips"
    SUPPORTED_EXTENSIONS: List[str] = NotImplemented  # [".edf", ".eeg", etc.]

    def __init__(self, file_path: str):
        self.file_path = Path(file_path)
        if not self.file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")

    @classmethod
    def can_load(cls, file_path: str) -> bool:
        """Check if adapter can load this file"""
        path = Path(file_path)
        return path.suffix.lower() in cls.SUPPORTED_EXTENSIONS

    @abstractmethod
    def load_metadata(self) -> StudyMetadata:
        """
        Extract and return study metadata.

        Returns:
            StudyMetadata with channels, sampling rate, duration
        """
        pass

    @abstractmethod
    def load_signals(self) -> np.ndarray:
        """
        Load and return EEG signals.

        Returns:
            ndarray shape (n_channels, n_samples), dtype float32, unit µV
        """
        pass

    def validate(self) -> Dict[str, bool]:
        """
        Validate loaded data against canonical contract.

        Returns:
            Dict with keys: {
                "valid_shape": bool,
                "valid_dtype": bool,
                "valid_unit": bool,
                "deterministic": bool,  # Bit-for-bit reproducible
            }
        """
        meta = self.load_metadata()
        signals = self.load_signals()

        return {
            "valid_shape": len(signals.shape) == 2,
            "valid_dtype": signals.dtype == np.float32,
            "valid_unit": meta.channels[0].unit == "uV",
            "deterministic": self._is_deterministic(signals),
        }

    @staticmethod
    def _is_deterministic(signals: np.ndarray) -> bool:
        """Check if repeated loads produce identical bytes"""
        # Implementation: compare SHA256 hashes of signal chunks
        pass
```

### Example: EDF Adapter (Reference Implementation)

**src/aplane/vendors/edf.py:**
```python
from .base import VendorAdapter, ChannelInfo, StudyMetadata
import mne
import numpy as np
from pathlib import Path

class EDFAdapter(VendorAdapter):
    """EDF format adapter (Nihon Kohden, GE, Philips all use EDF)"""

    VENDOR_NAME = "EDF"
    SUPPORTED_EXTENSIONS = [".edf"]

    def load_metadata(self) -> StudyMetadata:
        """Extract metadata from EDF header"""
        raw = mne.io.read_raw_edf(str(self.file_path), preload=False)

        channels = []
        for idx, ch_name in enumerate(raw.ch_names):
            ch_info = raw.info["chs"][idx]
            channels.append(ChannelInfo(
                index=idx,
                label=ch_name,
                canonical_id=self._map_to_canonical(ch_name),
                unit="uV",
                sampling_rate=raw.info["sfreq"]
            ))

        return StudyMetadata(
            study_id=self.file_path.stem,
            vendor="EDF",
            format="edf",
            source_file=str(self.file_path),
            n_channels=len(raw.ch_names),
            n_samples=raw.n_times,
            sampling_rate=raw.info["sfreq"],
            duration_seconds=raw.times[-1],
            channels=channels,
        )

    def load_signals(self) -> np.ndarray:
        """Load EEG signals from EDF"""
        raw = mne.io.read_raw_edf(str(self.file_path), preload=True)

        # Extract signals, convert to float32 (µV)
        signals = raw.get_data(units="µV")  # (n_channels, n_samples)
        return signals.astype(np.float32)

    @staticmethod
    def _map_to_canonical(vendor_label: str) -> str:
        """Map vendor channel name to canonical (10-20 system)"""
        mapping = {
            "Fp1": "FP1", "Fp2": "FP2",
            "F3": "F3", "F4": "F4",
            "C3": "C3", "C4": "C4",
            "P3": "P3", "P4": "P4",
            "O1": "O1", "O2": "O2",
            # ... comprehensive mapping
        }
        return mapping.get(vendor_label, vendor_label)  # Fallback to original
```

### Plugin Registry

**src/aplane/vendors/registry.py:**
```python
from typing import Type, Dict
from .base import VendorAdapter
from . import edf, natus, philips, ge, masimo

class VendorRegistry:
    """Central registry of all vendor adapters (discoverable)"""

    _adapters: Dict[str, Type[VendorAdapter]] = {}

    @classmethod
    def register(cls, adapter_class: Type[VendorAdapter]):
        """Register new adapter (called via decorator)"""
        cls._adapters[adapter_class.VENDOR_NAME] = adapter_class
        print(f"Registered {adapter_class.VENDOR_NAME} adapter")
        return adapter_class

    @classmethod
    def get_adapter_for_file(cls, file_path: str) -> Type[VendorAdapter]:
        """Auto-detect and return appropriate adapter"""
        for adapter_class in cls._adapters.values():
            if adapter_class.can_load(file_path):
                return adapter_class
        raise ValueError(f"No adapter found for {file_path}")

    @classmethod
    def list_adapters(cls) -> Dict[str, str]:
        """List all registered adapters"""
        return {
            name: adapter.VENDOR_NAME
            for name, adapter in cls._adapters.items()
        }

# Auto-register built-in adapters
@VendorRegistry.register
class _EDFAdapter(edf.EDFAdapter):
    pass

@VendorRegistry.register
class _NatusAdapter(natus.NatusAdapter):
    pass

# Community adapters can be registered dynamically:
# VendorRegistry.register(PhilipsAdapter)
# VendorRegistry.register(GEAdapter)
```

---

## PART II: COMMUNITY CONTRIBUTION WORKFLOW

### Contribution Process (CONTRIBUTING.md)

**How to Add a New Vendor:**

**Step 1: Fork + Branch**
```bash
git clone https://github.com/encephlian/aplane.git
git checkout -b vendor/acme-eeg
```

**Step 2: Implement Adapter**
```python
# src/aplane/vendors/acme.py

from .base import VendorAdapter, ChannelInfo, StudyMetadata
import struct
import numpy as np

class ACMEAdapter(VendorAdapter):
    VENDOR_NAME = "ACME"
    SUPPORTED_EXTENSIONS = [".acm", ".aeg"]

    def load_metadata(self) -> StudyMetadata:
        # Parse ACME binary format header
        with open(self.file_path, 'rb') as f:
            magic = f.read(4)
            if magic != b'ACME':
                raise ValueError("Invalid ACME file")

            # Read channels, sampling rate, etc.
            n_ch, fs = struct.unpack('<HH', f.read(4))
            # ... parse rest of header

        # Build metadata
        channels = [
            ChannelInfo(i, f"CH{i}", "FP1" if i==0 else f"CH{i}", "uV", fs)
            for i in range(n_ch)
        ]

        return StudyMetadata(
            study_id=self.file_path.stem,
            vendor="ACME",
            format="acm",
            source_file=str(self.file_path),
            n_channels=n_ch,
            n_samples=10000,  # Calculate from file size
            sampling_rate=float(fs),
            duration_seconds=10000/fs,
            channels=channels,
        )

    def load_signals(self) -> np.ndarray:
        # Read binary signal data
        with open(self.file_path, 'rb') as f:
            # Skip header
            f.seek(...)
            # Read signal chunk
            data = np.frombuffer(f.read(), dtype=np.float32)
            return data.reshape(n_ch, -1)
```

**Step 3: Add Tests**
```python
# tests/test_acme_adapter.py

import pytest
from pathlib import Path
from aplane.vendors.acme import ACMEAdapter

@pytest.fixture
def sample_acme_file():
    """Create minimal ACME test file"""
    # Generate binary test data
    with open("tests/fixtures/sample.acm", "wb") as f:
        f.write(b"ACME")  # Magic
        f.write(b"\x04\x00")  # 4 channels
        f.write(b"\xe8\x03")  # 1000 Hz sampling
        # ... write minimal signal data
    return Path("tests/fixtures/sample.acm")

def test_acme_metadata(sample_acme_file):
    adapter = ACMEAdapter(str(sample_acme_file))
    meta = adapter.load_metadata()
    assert meta.n_channels == 4
    assert meta.sampling_rate == 1000

def test_acme_signals(sample_acme_file):
    adapter = ACMEAdapter(str(sample_acme_file))
    signals = adapter.load_signals()
    assert signals.shape[0] == 4  # 4 channels
    assert signals.dtype == np.float32

def test_acme_validation(sample_acme_file):
    adapter = ACMEAdapter(str(sample_acme_file))
    validation = adapter.validate()
    assert validation["valid_shape"]
    assert validation["valid_dtype"]
    assert validation["deterministic"]
```

**Step 4: Add Documentation**
```markdown
# ACME EEG Adapter

## Supported Formats
- `.acm` — ACME proprietary binary format
- `.aeg` — ACME event file (optional)

## Installation
```bash
pip install aplane[acme]
```

## Usage
```python
from aplane.vendors.acme import ACMEAdapter

adapter = ACMEAdapter("patient_001.acm")
meta = adapter.load_metadata()
signals = adapter.load_signals()

# Export to canonical format
canonical = convert_to_canonical(meta, signals)
```

## Hardware Support
- ACME Neuro PRO v2+
- ACME CloudEEG API

## Status
Community-maintained (PR #18, @john_smith)
```

**Step 5: Submit PR**
```bash
git add src/aplane/vendors/acme.py tests/test_acme_adapter.py docs/vendors/ACME.md
git commit -m "Add ACME EEG vendor adapter

- Supports .acm and .aeg files
- Implements VendorAdapter ABC
- Full test coverage (3 tests)
- Deterministic output validated

Closes #17"

git push origin vendor/acme-eeg
# Open PR on GitHub
```

**Step 6: CI Validation**
- ✅ Lint: Black, isort, mypy
- ✅ Tests: Unit + integration (all 3 tests pass)
- ✅ Coverage: > 80% for new code
- ✅ Docs: Rendered + validated
- ✅ Performance: < 5s load time for 30min EEG

**Step 7: Maintainer Review & Merge**
- [ ] Code review (1-2 maintainers)
- [ ] Performance benchmarked
- [ ] Documentation approved
- [ ] Merge to main → Auto-release v0.x.x to PyPI

---

## PART III: GO-TO-MARKET STRATEGY (India-First)

### Market Segmentation

**Tier 1 Cities (Delhi, Mumbai, Bangalore, Chennai):** ~500 neurology clinics
- Target: Multi-specialist clinics, teaching hospitals
- Entry: Founder + 1 ops person (high-touch sales)
- Conversion rate (target): 15-20% (7-10 clinics)
- Deal size: $500-1,000/month per clinic
- Sales cycle: 3-4 weeks

**Tier 2 + Poly Clinics (secondary cities + rural):** ~2,000 clinics
- Target: Single-neurologist practices, government hospitals
- Entry: After Tier-1 traction (proof points)
- Conversion rate: 5-10%
- Deal size: $200-500/month per clinic
- Sales cycle: 4-6 weeks

**OEM Distribution (Medical device networks):**
- Partners: Apollo, Fortis, Max, Manipal
- Model: White-label SKU + revenue share (50/50)
- Scaling multiplier: 10-20x clinics per OEM relationship
- Pilot: 1 OEM (Month 6+)

### Sales Playbook: Tier 1 (First 4 Weeks)

**Week 1: Prospecting**
```
Target: 20 neurology clinics in Tier-1 cities
Method:
  ├─ Cold outreach (email + phone)
  │  └─ "Hi Dr. Sharma, we've built AI triage for EEG uploads.
  │     Would you like to see a demo? 15 min on Zoom."
  ├─ LinkedIn: Connect with neurologists (personalized message)
  ├─ WhatsApp: Share product demo link (if contact available)
  └─ Referrals: Ask existing users for intros

Cadence: 5-8 touchpoints/day
Target: 2-3 demos booked
```

**Week 2: Demos (In-Person when possible)**
```
Demo Script (15 min):
  ├─ Problem statement (2 min)
  │  └─ "Current EEG triage takes 2-3 hours per study.
  │     You lose revenue, patients wait."
  │
  ├─ Solution demo (10 min)
  │  ├─ Show upload flow (60 sec)
  │  ├─ Run triage (auto-inference, 30 sec)
  │  ├─ Show report (PDF, interpretable, 60 sec)
  │  └─ Explain token model (pricing, 30 sec)
  │
  └─ Ask for commitment (3 min)
     └─ "Can we set up a pilot? 10 free tokens, no commitment.
        Let's see if it saves time for your team."

Target: 1-2 pilots launched
```

**Week 3-4: Pilot Execution**
```
Pilot Workflow:
  ├─ Clinic uploads first EEG study
  ├─ You manually run triage (ensure quality output)
  ├─ Share report with clinic neurologist
  ├─ Get feedback: "Was it accurate? Would it save time?"
  ├─ If YES → Offer paid plan (starting $500/mo)
  └─ If NO → Debug + iterate (free additional pilots)

Success metrics:
  ├─ Clinic runs 3+ studies
  ├─ Reports match radiologist review
  ├─ Clinic reports 1-2 hours saved/week
  └─ Net Promoter Score > 7/10
```

### Sales Pitch (Elevator Version)

**For Neurologists:**
```
"We've built MIND — an AI assistant for EEG triage. Upload your
EEG, and get a machine-readable report in seconds (vs. 2-3 hours).

It's accurate (trained on 10K+ clinician-reviewed EEGs),
deterministic (same EEG = same answer), and works offline.

You pay per triage ($5-10/study), so you only pay for what saves
you time. First 10 triages are free—no credit card needed.

Want to try it?"
```

**For Hospital Administrators:**
```
"MIND is EEG intelligence infrastructure for clinics. It reduces
diagnostic turnaround time by 80%, frees up your neurologists for
complex cases, and increases clinic throughput.

Revenue impact: If you process 100 EEGs/month at ₹1,000 each,
MIND saves 200 neurologist hours/month (worth ₹2L+). You pay
₹25K/month for MIND—ROI is 8x in Year 1.

Plus, you own your data. No vendor lock-in. We're a utility,
not a constraint."
```

### Pricing Model

**Internal SKU** (for your ops team):
```
Unlimited access to MIND
€0 (first 3 months during pilot)
€1,000/month (Year 1)
€750/month (Year 2+, with 50% clinic rev share)
```

**Pilot SKU** (for paying clinics):
```
Token-based pricing:
├─ 1 Token = 1 Basic Triage (EEG meta + segments + artifacts)
├─ 2 Tokens = 1 STAT Triage (faster processing + SMS alert)
│
Pricing:
├─ Starter: 10 tokens/month = ₹500 ($6/token)
├─ Growth: 50 tokens/month = ₹2,000 ($4/token)
├─ Enterprise: 200 tokens/month = ₹6,000 ($3/token)
│
Trial: 10 free tokens (no credit card)
```

**OEM Distribution Model:**
```
For Apollo, Fortis, Max hospitals:

├─ White-label MIND as "Apollo EEG Assistant"
├─ Apollo handles billing + support (we provide API)
├─ Revenue split: 50% Encephlian / 50% Apollo
├─ Minimum commitment: 50 clinics, ₹50K/month
│
Benefits:
├─ Apollo: New revenue stream, patient satisfaction
├─ Encephlian: 50x clinic reach, predictable MRR
└─ Patients: Better EEG triage, faster diagnosis
```

### Sales Metrics & Targets

**Month 1-2 (Proof of Concept):**
| Metric | Target | Owner |
|--------|--------|-------|
| Clinics reached (cold) | 50 | Founder |
| Demos booked | 5 | Founder |
| Pilots launched | 2-3 | Founder + Ops |
| Paid subscriptions | 1 | — |
| MRR | ₹500 | — |

**Month 3-6 (Scale Tier 1):**
| Metric | Target | Owner |
|--------|--------|-------|
| Clinics reached | 200 | Founder + Sales |
| Paid subscriptions | 10 | Sales team |
| MRR | ₹50,000 | — |
| NPS (avg) | 8+/10 | Success |
| Churn | < 5%/mo | Success |

**Month 6-12 (Tier 2 + OEM Pilot):**
| Metric | Target | Owner |
|--------|--------|-------|
| Tier 1 clinics (paid) | 15-20 | — |
| Tier 2 clinics (pilot) | 5-10 | Regional sales |
| OEM partnerships | 1 signed | Founder + Biz Dev |
| MRR (direct) | ₹200,000 | — |
| MRR (OEM) | ₹100,000+ | — |

---

## PART IV: A-PLANE ROADMAP (Public)

**Published at:** github.com/encephlian/aplane/ROADMAP.md

### Q1 2026 (Now)
- ✅ v0.1.0: EDF adapter + CI/CD setup
- ✅ Accept first community PR (Natus adapter stub)
- ✅ Publish "How to Add a Vendor" guide
- 🔄 Set up GitHub Discussions (vendor requests)

### Q2 2026
- ⏳ v0.2.0: Natus + Nihon Kohden adapters (community PReviews)
- ⏳ Reach 500 GitHub stars
- ⏳ First vendor partner (Natus?) contributing directly
- ⏳ Expand test fixtures (20+ sample files across formats)

### Q3 2026
- ⏳ v0.3.0: Philips + GE adapters (community PRs)
- ⏳ 10+ vendor adapters supported
- ⏳ Academic paper: "Deterministic EEG Canonicalization" (published)
- ⏳ Conference talk: EMBC or IEEE Health Analytics

### Q4 2026
- ⏳ v1.0.0: Stable API, backward compatibility guarantee
- ⏳ 15+ vendors supported
- ⏳ Docker image for easy integration (open-source)
- ⏳ 1K+ GitHub stars

### 2027+
- ⏳ MLOps layer (automatic model retraining on canonical EEG data)
- ⏳ Hardware integrations (direct feeds from EEG devices)
- ⏳ Cloud federation (clinics share canonical data for model training, with privacy)

---

## PART V: FOUNDER PLAYBOOK (First 90 Days)

### Week 1-2: Product Polish + Documentation

**Tasks:**
- [ ] Clean up GitHub repository (encephlian-aplane is public)
- [ ] Write CONTRIBUTING.md + VENDOR_ADAPTER_GUIDE.md
- [ ] Create sample fixtures (EDF, Natus, Philips files)
- [ ] Set up CI/CD (GitHub Actions: lint, test, coverage)
- [ ] Configure PyPI publishing (automatic on tag)

**Deliverable:** Open-source repo ready for contributors

### Week 3-4: Prospecting + Inbound

**Tasks:**
- [ ] Create "MIND 90-day Pilot" landing page (Notion or simple HTML)
- [ ] Email 50 Tier-1 neurology clinics (personal, not bulk)
- [ ] Post on Twitter/LinkedIn: "We're open-sourcing A-Plane (EEG vendor adapters). Help us support every device, everywhere."
- [ ] Reach out to 3 potential vendors for partnerships (Natus, Philips, GE)
- [ ] Set up Calendly for 15-min demos

**Cadence:** 2-3 cold outreach/day, 1-2 demos/week

**Deliverable:** 2-3 pilots booked

### Week 5-8: Pilot Execution

**Tasks:**
- [ ] Run first paid clinic pilot (manual triage for 2-3 studies)
- [ ] Collect feedback + testimonials
- [ ] Fix bugs + optimize UX based on feedback
- [ ] Support 2-3 community vendors (GitHub issues, code reviews)
- [ ] Plan OEM partnership approach

**Success Criteria:**
- ≥ 1 clinic paying (₹500+/month)
- ≥ 2 community PRs merged (new adapters)
- ≥ 100 GitHub stars

**Deliverable:** Proof points for funding conversation

### Week 9-12: Scale + Investor Prep

**Tasks:**
- [ ] Expand to 5-10 paid clinics (Tier 1)
- [ ] Conduct 3-4 OEM exploratory calls
- [ ] Publish success metrics + roadmap
- [ ] Prepare investor pitch (deck, customer refs, financials)
- [ ] Hire 1 part-time sales/ops person (contractor)

**Success Criteria:**
- ≥ 5 paid clinics (MRR ₹2,500+)
- ≥ 500 GitHub stars
- ≥ 3 commits from community contributors
- Strong NPS + churn rate < 10%

**Deliverable:** Ready for Series A or grant discussions

---

## APPENDIX: Vendor Contact Strategy

### Tier 1: Direct Technical Partnerships

**Natus (Priority #1)**
```
Contact: Product/Engineering Lead for Neuro Works
Pitch: "We're building an open-source EEG canonicalization standard.
       Natus adapters are in high demand. Want to contribute or collaborate?"
Value: Your customers get seamless integration; we promote Natus in Asia.
Outcome: Co-marketing, GitHub sponsorship, or joint webinar
```

**Philips Healthcare**
```
Contact: Clinical EEG product manager
Pitch: Same as Natus, but emphasize India market (Philips strong in tier-1 hospitals)
Outcome: Technical collaboration, potential revenue share
```

### Tier 2: Community-Driven

**GE Healthcare, Masimo, etc.**
```
Strategy: Publish adapter requests on GitHub as bounties
         (e.g., "$500 bounty for GE Carescape adapter")
Outcome: Community vendors build adapters, we review + merge
```

### Tier 3: OEM Distribution

**Apollo Hospitals Group**
```
Contact: CTO or Innovation Officer
Pitch: "We've built MIND—AI EEG triage. You have 500+ neurology centers.
       Let's white-label this as Apollo EEG Assistant. 50/50 rev share."
Value: Apollo: New revenue stream, patient satisfaction
       Encephlian: 500x clinic reach, predictable MRR ₹50-100K/month
Timeline: 4-week pilot (2-3 Apollo centers) → rollout
```

---

## Success Metrics (12 Month)

| Metric | Target | Status |
|--------|--------|--------|
| **Open-Source** |
| GitHub stars | 1,000+ | TBD |
| Forks | 50+ | TBD |
| Community PRs | 10+ | TBD |
| Vendor adapters | 10+ | TBD |
| Monthly downloads (PyPI) | 5K+ | TBD |
|
| **Go-to-Market** |
| Clinics (Tier 1) | 15-20 | TBD |
| Clinics (Tier 2) | 5-10 | TBD |
| MRR (direct) | ₹200K+ | TBD |
| MRR (OEM pilot) | ₹100K+ | TBD |
| NPS (avg) | 8+/10 | TBD |
| Churn (monthly) | <10% | TBD |
|
| **Business** |
| ARR | ₹36L+ | TBD |
| Gross margin | 70%+ | TBD |
| CAC | <₹25K | TBD |
| LTV | >₹300K | TBD |
| Payback period | <6 months | TBD |

---

**Document Complete**

**Next Steps:**
1. Publish encephlian-aplane on GitHub (public)
2. Start Week 1-2 tasks (polish + docs)
3. Begin Week 3-4 prospecting (clinics + vendors)

**Contact:** hitesh@encephlian.com
