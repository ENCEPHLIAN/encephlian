#!/usr/bin/env python3
"""
Validate TUH corpus directory structure and files.
Usage: python validate_tuh.py
"""

import os
from pathlib import Path
from collections import defaultdict

def validate_tuh_corpus(tuh_root):
    """Check TUH corpus structure and count files."""
    tuh_path = Path(tuh_root)

    if not tuh_path.exists():
        print(f"❌ TUH_ROOT not found: {tuh_root}")
        return False

    print(f"📂 Validating TUH corpus at: {tuh_root}")
    print("=" * 60)

    results = {
        'train/normal': 0,
        'train/abnormal': 0,
        'eval/normal': 0,
        'eval/abnormal': 0,
    }

    errors = []

    for split in ['train', 'eval']:
        for label in ['normal', 'abnormal']:
            dir_path = tuh_path / split / label

            if not dir_path.exists():
                errors.append(f"❌ Missing directory: {dir_path}")
                continue

            # Count EDF files recursively
            edf_files = list(dir_path.glob("**/*.edf"))
            results[f'{split}/{label}'] = len(edf_files)

            print(f"✓ {split}/{label}: {len(edf_files)} EDF files")

            # Show first few files
            if edf_files:
                print(f"  Examples:")
                for f in sorted(edf_files)[:3]:
                    size_mb = f.stat().st_size / (1024*1024)
                    print(f"    - {f.name} ({size_mb:.1f} MB)")

    # Check for label files if in clean corpus
    print("\n📋 Checking for artifact labels (.lbl files):")
    lbl_files = list(tuh_path.glob("**/*.lbl"))
    print(f"   Found {len(lbl_files)} .lbl files")

    # Summary
    print("\n" + "=" * 60)
    total = sum(results.values())
    print(f"📊 Total EDF files: {total}")

    train_total = results['train/normal'] + results['train/abnormal']
    eval_total = results['eval/normal'] + results['eval/abnormal']

    print(f"   Training set: {train_total} files")
    print(f"     - Normal: {results['train/normal']}")
    print(f"     - Abnormal: {results['train/abnormal']}")
    print(f"   Evaluation set: {eval_total} files")
    print(f"     - Normal: {results['eval/normal']}")
    print(f"     - Abnormal: {results['eval/abnormal']}")

    # Status checks
    print("\n✅ Status Checks:")
    checks = [
        (results['train/normal'] > 0, "✓ Training normal data exists"),
        (results['train/abnormal'] > 0, "✓ Training abnormal data exists"),
        (results['eval/normal'] > 0, "✓ Evaluation normal data exists"),
        (results['eval/abnormal'] > 0, "✓ Evaluation abnormal data exists"),
        (results['train/normal'] >= 100, "✓ Training has >100 normal samples"),
        (results['train/abnormal'] >= 50, "✓ Training has >50 abnormal samples"),
        (train_total >= 200, "✓ Training has sufficient data for MIND®Triage"),
    ]

    all_passed = True
    for passed, msg in checks:
        status = "✓" if passed else "❌"
        print(f"   {status} {msg}" if passed else f"   ⚠️  {msg}")
        if not passed:
            all_passed = False

    if errors:
        print("\n⚠️  Issues found:")
        for error in errors:
            print(f"   {error}")

    return all_passed

def main():
    # Get TUH_ROOT from environment or use default
    tuh_root = os.getenv('TUH_ROOT', '/data/tuh_eeg')

    print("\n🧠 MIND®Training - TUH Corpus Validator")
    print("=" * 60)

    # Try environment variable
    if os.getenv('TUH_ROOT'):
        print(f"📍 Using TUH_ROOT from environment: {tuh_root}")
    else:
        print(f"📍 Using default path: {tuh_root}")
        print(f"   Tip: Set environment variable to use custom path:")
        print(f"   export TUH_ROOT=/your/path/to/tuh_eeg")

    print()

    valid = validate_tuh_corpus(tuh_root)

    if valid:
        print("\n✅ TUH corpus is ready for training!")
        print("   Run: python train_triage.py")
        print("   Run: python train_clean.py")
    else:
        print("\n❌ TUH corpus validation failed.")
        print("\n📥 To download TUH corpus:")
        print("   1. Visit: https://www.isip.piconepress.com/projects/tuh_eeg/")
        print("   2. Register and download the full corpus")
        print("   3. Extract to a directory")
        print("   4. Set: export TUH_ROOT=/path/to/extracted/tuh_eeg")
        print("   5. Run this validator again")

if __name__ == "__main__":
    main()
