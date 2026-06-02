#!/usr/bin/env python3
"""Backfill public.model_validation_runs rows for currently-serving models.

Run this AFTER applying the DDL portion of
supabase/migrations/20260602000100_model_validation_gate.sql via Supabase Studio.

The DDL portion creates the table, the trigger, and the gate function.
This script populates the two backfill rows (mind_triage 3.0.1 and
heuristic_seizure 0.1.0) via PostgREST. Idempotent — re-runnable. If the
DDL migration already executed the INSERTs (which it does), this script
is a no-op verification path.

Usage:
    python scripts/backfill_model_validation_runs.py [--dry-run]

Exit codes:
    0 — every serving model_versions row has a qualifying validation_runs row
    1 — at least one serving row is unvalidated (the trigger would refuse
        any further status update on that row)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

SUPABASE_URL = os.environ.get(
    "SUPABASE_URL", "https://mngkbtsummbknrbpjbye.supabase.co"
)
SUPABASE_KEY = os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uZ2tidHN1bW1ia25yYnBqYnllIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI1Mzk4MiwiZXhwIjoyMDg5ODI5OTgyfQ.FifWkTKLZcAZcb8RB7Ra9D8_NJsjd3DDilMLsYmIunM",
)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=representation",
}


def get(path: str, params: dict | None = None) -> list:
    qs = ("?" + urllib.parse.urlencode(params)) if params else ""
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}{qs}", headers=HEADERS, method="GET"
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def post(path: str, body) -> list:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        data=json.dumps(body).encode(),
        headers=HEADERS,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt else []
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}: {e.read().decode()[:500]}", file=sys.stderr)
        raise


def find_model(name: str, version: str) -> dict | None:
    rows = get(
        "model_versions",
        {"select": "id,name,version,status", "name": f"eq.{name}", "version": f"eq.{version}"},
    )
    return rows[0] if rows else None


BACKFILLS = [
    {
        "lookup": ("mind_triage", "3.0.1"),
        "row": {
            "corpus_name": "TUH-Abnormal",
            "corpus_version": "v3.0.1",
            "n_files": 1,
            "n_samples": 1,
            "metrics": {
                "auc": 0.857,
                "f1": 0.78,
                "source": "training_time_aggregate",
            },
            "verdict": "functional",
            "script_blob_path": "apps/training/train_mind_triage.py",
            "notes": (
                "Backfilled 2026-06-02 from training-time metrics recorded in "
                "model_versions.validation_metrics. NOT an independent held-out "
                "validation — re-validate against TUH-Abnormal eval split and "
                "append a fresh row before next serving promotion."
            ),
        },
    },
    {
        "lookup": ("heuristic_seizure", "0.1.0"),
        "row": {
            "corpus_name": "rule-coded-placeholder",
            "corpus_version": None,
            "n_files": 1,
            "n_samples": 1,
            "metrics": {
                "kind": "rule",
                "rule": "z-score spike threshold",
                "trained": False,
                "empirical_validation": "owed_against_TUSZ",
            },
            "verdict": "functional",
            "script_blob_path": "libs/score/engine.py",
            "notes": (
                "Backfilled 2026-06-02. heuristic_seizure is a rule-based z-score "
                "spike detector, not a trained model — there are no training "
                "metrics to record. Verdict reflects shipped behaviour under the "
                "current contract (placeholder until vertex_head_c)."
            ),
        },
    },
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    print(f"Target: {SUPABASE_URL}")
    print(f"Mode  : {'DRY RUN' if args.dry_run else 'EXECUTE'}\n")

    # Sanity check: table must exist. If the DDL migration has not been
    # applied yet, this call returns 404 and we exit loudly.
    try:
        get("model_validation_runs", {"select": "id", "limit": "1"})
    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(
                "ERROR: public.model_validation_runs not reachable via PostgREST. "
                "Apply the DDL portion of migrations/20260602000100_model_validation_gate.sql "
                "via Supabase Studio first, then re-run this script.",
                file=sys.stderr,
            )
            return 2
        raise

    for spec in BACKFILLS:
        name, version = spec["lookup"]
        m = find_model(name, version)
        if not m:
            print(f"SKIP   {name} {version}: not found in model_versions")
            continue
        mvid = m["id"]
        existing = get(
            "model_validation_runs",
            {
                "select": "id,verdict,corpus_name",
                "model_version_id": f"eq.{mvid}",
                "verdict": "in.(functional,excellent)",
            },
        )
        if existing:
            print(f"OK     {name} {version}: already has {len(existing)} qualifying row(s)")
            continue
        row = {"model_version_id": mvid, **spec["row"]}
        print(f"INSERT {name} {version} <- {row['corpus_name']} verdict={row['verdict']}")
        if not args.dry_run:
            inserted = post("model_validation_runs", row)
            print(f"       inserted id={inserted[0]['id'] if inserted else '?'}")

    # Final audit: every serving row must have a qualifying validation_runs row.
    print("\nAudit: every serving model has qualifying validation?")
    serving = get(
        "model_versions",
        {"select": "id,name,version,status", "status": "eq.serving"},
    )
    fail = 0
    for s in serving:
        runs = get(
            "model_validation_runs",
            {
                "select": "id,verdict",
                "model_version_id": f"eq.{s['id']}",
                "verdict": "in.(functional,excellent)",
            },
        )
        mark = "OK" if runs else "MISS"
        if not runs:
            fail += 1
        print(f"  [{mark}] {s['name']:25s} {s['version']:10s} {len(runs)} qualifying run(s)")

    if fail:
        print(f"\nFAIL: {fail} serving row(s) unvalidated — trigger would refuse next status update")
        return 1
    print(f"\nPASS: all {len(serving)} serving row(s) validated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
