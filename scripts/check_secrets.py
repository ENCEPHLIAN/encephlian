#!/usr/bin/env python3
"""
ENCEPHLIAN secret-pattern scanner. Invoked by .pre-commit-config.yaml as a
local hook. Receives staged file paths as argv, exits non-zero on any match.

Patterns (in priority order):
  1. JWT tokens: header.payload.signature where header decodes to start with eyJhbGci
  2. Literal Supabase key assignment: SUPABASE_*_KEY = "eyJ...
  3. Azure storage account keys: 88-char base64 in AZURE_STORAGE_KEY context

To allow a specific line (e.g. an example in docs), append:
    # pragma: allowlist secret
"""
from __future__ import annotations

import pathlib
import re
import sys

ALLOW = "pragma: allowlist secret"

PATTERNS: list[tuple[str, re.Pattern[str], str]] = [
    (
        "jwt",
        re.compile(r"eyJhbGci[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"),
        "JWT token detected (header.payload.signature; eyJhbGci-prefixed)",
    ),
    (
        "supabase_literal",
        re.compile(
            r"(SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE_KEY|SUPABASE_ANON_KEY)"
            r"\s*[:=]\s*[\"']eyJ",
            re.IGNORECASE,
        ),
        "Literal Supabase key assignment (must come from env, never source)",
    ),
    (
        "azure_storage",
        re.compile(
            r"(AZURE_STORAGE_KEY|AZURE_STORAGE_ACCOUNT_KEY|AccountKey)"
            r"\s*[:=]\s*[\"']?[A-Za-z0-9+/]{86}==",
            re.IGNORECASE,
        ),
        "Azure storage account key (88-char base64)",
    ),
]


def scan(paths: list[str]) -> int:
    hits: list[tuple[str, str, int, str]] = []
    for raw in paths:
        path = pathlib.Path(raw)
        if not path.is_file():
            continue
        try:
            text = path.read_text(errors="ignore")
        except OSError:
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            if ALLOW in line:
                continue
            for name, pattern, _msg in PATTERNS:
                if pattern.search(line):
                    hits.append((name, raw, lineno, line.strip()[:200]))
                    break  # one finding per line is enough
    if not hits:
        return 0
    print("ENCEPHLIAN secret scan: blocked commit", file=sys.stderr)
    for name, path, lineno, snippet in hits:
        msg = next(m for n, _, m in PATTERNS if n == name)
        print(f"  [{name}] {path}:{lineno}", file=sys.stderr)
        print(f"    {msg}", file=sys.stderr)
        print(f"    > {snippet}", file=sys.stderr)
    print(
        "\nTo bypass for a known-safe example (e.g. docs), append "
        "`# pragma: allowlist secret` to the line.\n"
        "To rotate a leaked credential: revoke in the provider console FIRST, "
        "then scrub history with git-filter-repo.",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(scan(sys.argv[1:]))
