#!/usr/bin/env python3
"""Run the strict validator and capture *that invocation's* complete output.

This wrapper never carries forward a transcript from an older candidate. A
failed or unavailable PostgreSQL runtime is recorded as such and exits
nonzero; it is never rewritten as PASS.
"""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
RESULT = ROOT / "tests" / "VALIDATION_RESULTS.txt"


def main() -> int:
    proc = subprocess.run(
        [sys.executable, str(ROOT / "tests" / "run_all.py")],
        cwd=ROOT,
        env=os.environ.copy(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        check=False,
    )
    status = "PASS" if proc.returncode == 0 else "FAIL_OR_UNAVAILABLE"
    payload = (
        "Rosetta 2.5.13 current-build runtime validation\n"
        f"status: {status}\n"
        f"exit_code: {proc.returncode}\n"
        "command: python3 tests/run_all.py\n"
        "production_target: forbidden by runner preflight\n\n"
        + proc.stdout
    )
    RESULT.write_text(payload, encoding="utf-8")
    print(payload, end="")
    return proc.returncode


if __name__ == "__main__":
    raise SystemExit(main())
